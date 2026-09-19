# 词位数据只作信息展示，不进入评分与结论
卖家精灵反查响应里已含每个关键词的 `rankPosition`、`adPosition`、`naturalRatio`、`adRatio`，可据此判断某个 ASIN 是自然出单还是靠广告支撑。决定这批字段只用于展示给用户看，不喂给 `research-core` 的 Demand / Entry 评分，因为复合评分已被判定为不直观且不可信，用户要看的是原始位置信息而非又一次打分。
## Consequences
- 新增字段只需打通协议与展示层，不改动评分模型。
- 未来的开发者不应「顺手」把位置数据接入评分；需要时先推翻本 ADR。
