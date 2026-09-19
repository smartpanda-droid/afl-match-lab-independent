import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const AFL_INJURY_LIST = "https://www.afl.com.au/matches/injury-list";
const AFL_RSS = "https://www.afl.com.au/rss";
const TEAM_NAME_BY_BADGE:Record<string,string>={
  ADEL:"Adelaide Crows",ADE:"Adelaide Crows",
  BRIS:"Brisbane Lions",BL:"Brisbane Lions",
  CARL:"Carlton",COLL:"Collingwood",ESS:"Essendon",
  FREM:"Fremantle",FRE:"Fremantle",
  GEEL:"Geelong Cats",GCFC:"Gold Coast SUNS",GCS:"Gold Coast SUNS",
  GWS:"GWS GIANTS",HAW:"Hawthorn",MELB:"Melbourne",
  NMFC:"North Melbourne",NTH:"North Melbourne",
  PORT:"Port Adelaide",PA:"Port Adelaide",
  RICH:"Richmond",STK:"St Kilda",SYD:"Sydney Swans",
  WCE:"West Coast Eagles",WB:"Western Bulldogs",WBD:"Western Bulldogs"
};
const EXPECTED_TOKEN_SHA256 = "6599bf00eaa1a6659945d1853aa4d385e1b52fe4a98453cb38d9f83a728bc47d";
async function sha256Hex(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function decodeHtml(s:string){const map:Record<string,string>={"&amp;":"&","&quot;":"\"","&#39;":"'","&apos;":"'","&nbsp;":" ","&lt;":"<","&gt;":">"};return s.replace(/&(amp|quot|#39|apos|nbsp|lt|gt);/g,m=>map[m]??m).replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
function stripTags(s:string){return decodeHtml(s.replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function absUrl(href:string){if(href.startsWith("http"))return href;if(href.startsWith("//"))return `https:${href}`;return `https://www.afl.com.au${href.startsWith("/")?"":"/"}${href}`;}
function discoverInjuryUrl(html:string){for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const text=stripTags(m[2]).toLowerCase();if(text.includes("medical room")&&text.includes("full afl injury list"))return absUrl(m[1]);}for(const m of html.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/gi)){if(m[1].toLowerCase().includes("medical room")&&m[1].toLowerCase().includes("full afl injury list"))return m[2].trim();}const f=[...html.matchAll(/https:\/\/www\.afl\.com\.au\/news\/\d+\/medical-room-the-full-afl-injury-list-[^\s<"']+/gi)];return f.length?f[0][0]:null;}
function parseArticle(html:string){
  const rows:Array<Record<string,unknown>>=[];
  const tableRegex=/<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  for(const table of html.matchAll(tableRegex)){
    const tableIndex=table.index??0;
    const prefix=html.slice(Math.max(0,tableIndex-7000),tableIndex);
    const badges=[...prefix.matchAll(/Straps-Badge-Refresh_([A-Z]+)_FA(?:_v\d+)?/g)];
    const teamCode=badges.length?badges[badges.length-1][1]:null;
    const teamName=teamCode?TEAM_NAME_BY_BADGE[teamCode]??null:null;

    for(const tr of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
      const cells=[...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>stripTags(x[1]));
      if(cells.length<3) continue;
      const [player,injury,estimated_return]=cells;
      if(!player||/^player$/i.test(player)||/^injury$/i.test(injury)||/^updated:/i.test(player)) continue;
      const suspended=/^(suspended|suspension)$/i.test(injury.trim());
      rows.push({
        player,injury,estimated_return,
        team_code:teamCode,team_name:teamName,
        status:suspended?"suspended":"reported",
        tog_recovery_required:!suspended,
        notes:"Automatically parsed from AFL.com.au injury list"
      });
    }
  }
  const dedup=new Map<string,Record<string,unknown>>();
  for(const r of rows){
    const key=`${String(r.team_name??"").toLowerCase()}|${String(r.player).toLowerCase()}`;
    dedup.set(key,r);
  }
  return [...dedup.values()];
}
async function fetchArticleRows(url:string){const uas=["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36","Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)","AFL-Match-Lab/1.0"];let lastLen=0;for(let i=0;i<uas.length;i++){const u=`${url}${url.includes("?")?"&":"?"}mlsync=${Math.floor(Date.now()/60000)}-${i}`;const r=await fetch(u,{headers:{"User-Agent":uas[i],"Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Accept-Language":"en-AU,en;q=0.9","Cache-Control":"no-cache"}});if(!r.ok)continue;const html=await r.text();lastLen=html.length;const rows=parseArticle(html);if(rows.length>=3)return {rows,htmlLength:html.length,attempt:i+1};}throw new Error(`Parsed too few injury rows after retries; last_html_length=${lastLen}`);}
Deno.serve(async(req:Request)=>{
  const token=req.headers.get("x-afl-sync-token")??"";
  if(!token||await sha256Hex(token)!==EXPECTED_TOKEN_SHA256){
    return new Response(JSON.stringify({status:"unauthorized"}),{
      status:401,
      headers:{"Content-Type":"application/json"}
    });
  }

  try{
    try{
      const parsed=await fetchArticleRows(AFL_INJURY_LIST);
      return new Response(JSON.stringify({
        status:"ok",
        article_url:AFL_INJURY_LIST,
        reported_at:new Date().toISOString(),
        payload:parsed.rows,
        fetch_attempt:parsed.attempt,
        html_length:parsed.htmlLength,
        discovery_method:"stable_injury_list_v8"
      }),{headers:{"Content-Type":"application/json"}});
    }catch(primaryError){
      const rss=await fetch(AFL_RSS,{headers:{
        "User-Agent":"Mozilla/5.0 AFL-Match-Lab/1.0",
        "Accept":"application/rss+xml,application/xml,text/xml,*/*",
        "Cache-Control":"no-cache"
      }});
      if(!rss.ok) throw new Error(`AFL RSS ${rss.status}`);
      const articleUrl=discoverInjuryUrl(await rss.text());
      if(!articleUrl){
        throw new Error(
          "Stable injury list failed and RSS fallback could not discover article: "+
          (primaryError instanceof Error?primaryError.message:String(primaryError))
        );
      }
      const parsed=await fetchArticleRows(articleUrl);
      return new Response(JSON.stringify({
        status:"ok",
        article_url:articleUrl,
        reported_at:new Date().toISOString(),
        payload:parsed.rows,
        fetch_attempt:parsed.attempt,
        html_length:parsed.htmlLength,
        discovery_method:"rss_article_fallback_v8"
      }),{headers:{"Content-Type":"application/json"}});
    }
  }catch(e){
    return new Response(JSON.stringify({
      status:"error",
      error:e instanceof Error?e.message:String(e)
    }),{status:500,headers:{"Content-Type":"application/json"}});
  }
});
