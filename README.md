# AFL Match Lab — Multi Lab Match Market Picker

这个补丁把 Multi Lab 的比赛市场入口拆成三块：

1. 胜负
   - 显示当场主客队名称
   - 点击球队直接加入当前 Multi Lab 组合

2. 大小球
   - 默认中线 = 模型 predicted total
   - 滑杆范围 = 后端根据 total_sd 自适应
   - step = 0.5
   - 拖动后可选 Over / Under 加入组合

3. 让球
   - 分主队与客队
   - 默认中线 = 模型 fair home line
   - 客队盘口自动取相反数
   - 滑杆范围 = 后端根据 margin_sd 自适应
   - step = 0.5

## 文件

- `src/components/MultiLabMarketPicker.jsx`
- `src/lib/multiLabMarkets.js`
- `src/multilab-market-picker.css`

## 接入方式

在 Multi Lab 页面引入：

```jsx
import MultiLabMarketPicker from "./components/MultiLabMarketPicker";
import "./multilab-market-picker.css";

<MultiLabMarketPicker
  matchId={selectedMatchId}
  onAddLeg={(leg) => addLegToCurrentMulti(leg)}
/>
```

`onAddLeg` 返回一个标准对象，包含：

- `market`
- `selection`
- `threshold`
- `team_name`
- `model_probability`
- `fair_odds`
- `match_id`
- `source: "manual_match_market"`

请把它送入你现在 Multi Lab 的手动组合数组即可。

## 重要

这个补丁不会触发 System Multi 自动生成，也不会刷新 System Multi cache。

Multi Lab 应保持：

打开页面 -> 读取可用腿 -> 用户手动选择 -> 只计算当前选择组合概率 / fair odds / value。

## Supabase client

`src/lib/multiLabMarkets.js` 假设你项目中已经有：

```js
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(...);
```

并导出为 `src/lib/supabaseClient.js`。

如果你的路径不同，修改 import 即可。

## RPC 名称

当前补丁默认调用：

- `afl_multi_lab_match_market_picker`
- `afl_multi_lab_match_market_quote`

如果你数据库里实际部署的函数名不同，只需要修改 `src/lib/multiLabMarkets.js` 里的 RPC 字符串。
