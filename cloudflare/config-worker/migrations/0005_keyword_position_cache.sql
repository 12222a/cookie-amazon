-- 卖家精灵关键词反查原始响应；小组由服务端访问密钥确定。
CREATE TABLE IF NOT EXISTS keyword_position_cache (
  asin TEXT NOT NULL,
  market TEXT NOT NULL,
  group_name TEXT NOT NULL,
  payload BLOB NOT NULL,
  stored_at INTEGER NOT NULL,
  PRIMARY KEY (asin, market, group_name)
);
