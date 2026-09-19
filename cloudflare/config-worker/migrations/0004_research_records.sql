-- 小组研究记录。
--
-- 主键含 group_name：不同小组各研究同一个 ASIN 是正常的，不该互相覆盖。
-- owner 由服务端按访问密钥确定，客户端提交的 owner/group 一律忽略——
-- 否则任何人都能把自己写成别人的记录，隔离就是摆设。
CREATE TABLE IF NOT EXISTS research_records (
  asin TEXT NOT NULL,
  market TEXT NOT NULL,
  group_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (asin, market, group_name)
);

CREATE INDEX IF NOT EXISTS research_records_group_updated
  ON research_records (group_name, updated_at DESC);
