# fwqgo AI CMS 产品需求文档

## 1. 背景与目标

fwqgo 现阶段的内容策略需要从“采集其他推广网站文章并改写”升级为“基于一手素材和结构化服务器配置，使用 AI 生成原创推广内容”。

新的 CMS 不应只是传统文章后台，而应成为一个 AI 驱动的素材处理、文章生成、服务器配置提取、图片管理和发布系统。

核心目标：

- 从推广文章、厂商官网、厂商邮件、活动页等来源获取素材。
- 将推广文章素材改写为本站原创中文推广文章和英文推广文章。
- 将商户服务器配置信息提纯为结构化服务器套餐数据。
- 统一管理返利链接，发布前自动替换或注入正确返利链接。
- 支持 AI 写作、AI 图片生成、图片上传、图片优化和图片管理。
- 支持中文和英文的内容生产，但是后台使用全中文。
- 前台公开访问，CMS 后台使用独立子域名 `cms.fwqgo.com`。

## 2. 产品定位

CMS 的定位：

```text
AI 驱动的服务器推广内容生产和管理系统。
```

CMS 的核心能力：

- 素材输入
- 抓取与清洗
- AI 改写
- 服务器配置提取
- 返利链接管理
- Tag 管理
- 图片上传与 AI 图片生成
- AI 任务可视化
- 失败任务手动重试
- 人工审核发布

## 3. 前后台访问结构

### 3.1 前台

前台用于公开访问和 SEO 收录。

域名：

```text
https://fwqgo.com
https://www.fwqgo.com
```

前台内容包括：

- 首页
- 需求分类页
- 服务器配置列表页
- 商户页
- 文章详情页
- Tag 聚合页
- 地区聚合页
- 线路聚合页
- 中英文 SEO 页面

### 3.2 CMS 后台

后台使用独立子域名：

```text
https://cms.fwqgo.com
```

要求：

- CMS 与前台边界清晰。
- `cms.fwqgo.com` 需要额外安全保护。
- 后台可以部署到服务器，但不应向所有公网用户直接开放。

后台访问保护方式：

- Basic Auth + 管理员登录


## 4. 主菜单与内容分类

主菜单按“需求”分类，而不是优先按地区分类。

推荐一级菜单：

```text
VPS 优惠
独立服务器
线路推荐
建站推荐
流媒体解锁
商家
最新活动
```

地区作为独立入口、筛选维度和 SEO 聚合页：

```text
美国服务器
香港服务器
日本服务器
新加坡服务器
欧洲服务器
```

分类原则：

- 主分类承载核心导航和主要 SEO 结构。
- 地区、线路、价格、商家、付款周期等作为筛选维度。
- 高价值筛选组合可以生成 SEO 聚合页。

## 5. Tag 标签体系

文章需要支持 Tag，但 Tag 不承担主分类职责。

Tag 用于：

- 文章关联推荐
- 后台管理筛选
- 服务器配置关联
- 长尾 SEO 聚合
- 内容特征标记

Tag 类型：

```text
商户 tag
地区 tag
线路 tag
用途 tag
配置 tag
活动 tag
```

示例：

```text
RackNerd
美国 VPS
洛杉矶
年付 VPS
KVM
1Gbps
优惠码
黑五活动
低价 VPS
```

Tag 需要有 `indexable` 控制字段。

适合收录的 Tag：

```text
cheap-vps
hong-kong-vps
cn2-gia
racknerd
streaming-vps
```

不适合收录的 Tag：

```text
1gb-ram
2026-06
temporary
random-promo
```

## 6. 素材来源与素材类型

CMS 首先接收素材，再由 AI 和系统规则进行处理。

### 6.1 素材输入形式

支持：

```text
网址
邮件
手动粘贴文本
文件导入
```

### 6.2 素材类型

素材分两类。

第一类：推广文章素材

```text
目标：改写成本站原创推广文章。
```

来源示例：

- 其他推广网站文章
- 厂商活动软文
- 邮件推广内容
- 论坛活动帖

第二类：商户服务器配置信息

```text
目标：提纯为结构化服务器套餐数据。
```

来源示例：

- 厂商官网活动页
- 厂商套餐页
- 厂商邮件
- 商户后台导出的套餐信息
- 手动粘贴的配置表

## 7. 推广文章处理流程

推广文章素材的处理目标是生成原创文章，并替换或注入正确返利链接。

流程：

```text
输入 URL / 邮件 / 文本
-> 抓取原始内容
-> 清洗正文、标题、图片和外链
-> 识别商户
-> 识别套餐、价格、优惠码、活动时间
-> 匹配系统中的返利链接规则
-> AI 改写为本站原创中文推广文章
-> 生成中文的 SEO 标题、描述、摘要
-> 生成中文 Tag
-> 生成或绑定中文封面图
-> AI 根据中文文章改写英文文章
-> 生成英文的 SEO 标题、描述、摘要
-> 生成英文 Tag
-> 生成或绑定英文封面图
-> 人工审核
-> 发布
```

要求：

- AI 可以参考原始文章，但不能直接照搬。
- AI 不应自行生成最终返利链接。
- 文章中的外链必须由系统统一处理。
- 发布前需要检查所有外链是否已返利化。
- 对于未识别/未匹配到商户返利规则的外链，采取“策略 B（加属性并报警）”：保留原链接但自动追加 rel="nofollow noopener"，并将当前任务状态标记为 manual_required（提示人工审核未识别的外链）。
- 改写后文章应保留真实配置、价格、优惠码和限制条件。
- 改写要求可在设置中配置
- 中文与英文文章互相独立，生成互不影响，生成流程全部后台进行

## 8. 商户服务器配置处理流程

商户服务器配置信息的处理目标是结构化入库，而不是直接生成文章。

流程：

```text
输入 URL / 邮件 / 文本 / 文件
-> 抓取或解析素材
-> 清洗内容
-> 识别商户
-> 提取服务器配置
-> 标准化字段
-> 去重和合并
-> 匹配返利链接
-> 写入服务器配置专用表
-> 人工审核
-> 前台展示或供文章引用
```

服务器配置字段建议：

```text
商户
套餐名称
CPU
内存
硬盘
流量
带宽
地区
线路
IPv4 / IPv6
虚拟化类型
价格
币种
付款周期
原价
折后价
优惠码
活动开始时间
活动结束时间
库存状态
购买链接
返利链接
来源 URL
来源类型
状态
```

状态示例：

```text
待审核
已发布
已过期
已下架
```

去重与更新规则：
- 提取商户套餐时，只要配置相同（核心硬件及网络参数一致），系统即可当作旧套餐进行更新（UPSERT 折后价、原价和优惠码等），避免重复创建同一套餐的冗余记录。

## 9. 返利链接管理

返利链接不依赖 AI 记忆，存入数据表中，由人手工维护。

要求：

- 可以维护返利链接。
- 服务器套餐可以绑定独立购买链接和返利链接。
- 原文链接需要识别所属商户。
- 根据商户匹配替换或注入返利链接。
- 发布前必须检查所有外链是否已处理。
- 策略 B（加属性并报警）：对于未知或未识别外链，保留原链接但自动追加 rel="nofollow noopener" 属性，并将相关任务状态标记为 manual_required，提示人工审核。
- 保留链接替换日志，便于追溯。

处理逻辑：

```text
原始链接
-> 识别商户
-> 数据库中查询此商户的返利链接
-> 替换
-> 写入替换日志
-> 进入发布内容
```

## 10. AI 配置

AI 能力必须可配置，不能写死模型和参数。

### 10.1 写作 AI

写作 AI 支持：

```text
DeepSeek
OpenAI-compatible 中转站
其他兼容接口
```

配置项：

```text
baseUrl
apiKey
model
temperature
maxTokens
system prompt
写作风格
SEO 规则
返利链接规则提示
```

写作 AI 用于：

- 推广文章改写
- SEO 标题生成
- SEO 描述生成
- 摘要生成
- Tag 生成
- 服务器配置解释
- 英文版本生成或辅助优化

### 10.2 图片 AI

图片 AI 与写作 AI 分开配置。

图片 AI 支持：

```text
image2 中转站
```

配置项：

```text
baseUrl
apiKey
image model
size
quality
style preset
negative prompt
默认封面图提示词模板
```

图片 AI 用于：

- 根据文章生成封面图
- 根据商户或活动生成推广图
- 为列表页和首页推荐位生成视觉资产

## 11. AI 工作可视化

AI 处理过程必须可视化。

推广文章任务步骤：

```text
1. 抓取素材
2. 清洗正文
3. 识别商户
4. 提取套餐/优惠信息（此步骤失败不影响流程）
5. 匹配返利链接
6. AI 改写文章
7. 生成 SEO 信息
8. 生成 Tag
9. 生成封面图提示词
10. 调用图片 AI
11. 图片 webp 优化
12. 生成草稿
13. 等待人工审核
```

服务器配置任务步骤：

```text
1. 抓取素材
2. 清洗内容
3. 识别商户
4. 提取服务器配置
5. 标准化字段
6. 去重
7. 匹配返利链接
8. 写入服务器配置表
9. 等待人工审核
```

每一步需要有状态：

```text
pending
running
success
failed
skipped
manual_required
```

## 12. AI 任务失败与重试

AI 任务失败后必须支持手动重试，并且可以从成功的上一步继续执行。

示例：

```text
抓取成功
清洗成功
商户识别成功
AI 改写失败
```

重试时应从：

```text
AI 改写
```

继续，而不是重新抓取、重新清洗。

后台需要支持：

- 从指定步骤重新执行
- 手动编辑中间结果后继续
- 查看错误日志
- 查看每一步输入和输出
- 异步队列触发：在管理后台点击“运行/重试”时，异步触发微型队列处理任务步骤，避免前端请求超时或阻塞。


## 13. 图片管理

CMS 需要独立图片管理模块，不只是文章编辑器中的上传按钮。

### 13.1 图片类型

图片分两类：

```text
编辑上传的商家图片
AI 生成的文章封面图
```

商家图片示例：

- 商家 logo
- 官网活动截图
- 产品图
- 控制台截图
- 促销 banner

AI 图片示例：

- 文章封面
- 首页推荐图
- 活动专题图
- 列表卡片图

### 13.2 图片处理流程

流程：

```text
上传或生成图片
-> 存到服务器
-> 转换为 webp
-> 服务器工具优化
-> 生成公开 URL
-> 进入图片库
-> 前台使用优化后的 webp
```

图片最终统一使用底层依赖（如 Node 内部的 Sharp 库）处理并转换为 webp。
图片处理需自动支持响应式资产切图，上传/生成时自动裁剪生成双规格：
- 缩略图 `_thumb.webp`（宽度约 400px，供列表页、卡片及推荐位使用，减小页面体积）
- 详情大图 `_large.webp`（宽度约 1200px，供文章详情及高清展示使用）

图片存储在服务器公开目录。

推荐目录：

```text
/var/www/fwqgo/shared/uploads/images
```

公开 URL 示例：

```text
https://fwqgo.com/uploads/images/2026/06/example.webp
```

目录建议按年月或用途拆分：

```text
uploads/images/2026/06/
uploads/images/providers/
uploads/images/posts/
```

### 13.3 图片管理功能

图片管理模块需要支持：

- 上传图片
- AI 生成图片
- 查看图片库
- 按商户筛选
- 按文章筛选
- 按图片类型筛选
- 查看原始图片信息
- 查看 webp 优化结果
- 编辑中文 alt
- 编辑英文 alt
- 绑定文章
- 绑定商户
- 设为文章封面
- 删除或停用图片

图片资产建议记录：

```text
id
type
providerId
postId
originalFileName
originalFormat
finalFormat
width
height
size
publicUrl
storagePath
altZh
altEn
sourceUrl
prompt
status
createdAt
```

## 14. 文章与双语 SEO

内容生产以中文为主。

要求：

- 中文文章是内容生产和编辑的主版本。
- 英文文章是根据中文用AI翻译过来的版本。
- 英文单独做 SEO 优化。
- 中文有的SEO，英文都要有，但不是直接翻译，是根据英文文章生成自己的。

多语言路由与 SEO 规范：
- 全篇统一规范为默认根目录（`/`）+ `/en/`。
- 访问默认根目录（如 `https://fwqgo.com/fwq/example`）即为中文主版本。
- 访问带 `/en/` 前缀（如 `https://fwqgo.com/en/fwq/example`）即为英文独立版本。

SEO 技术规则：

- 已有中英文对应页面时，每个语言页面 canonical 指向自身。
- 中英文页面通过 `hreflang` 互相关联。
- 中文页面声明中文和英文 alternate。
- 英文页面声明中文和英文 alternate。

示例（中文默认根路径页面）：

```html
<link rel="canonical" href="https://fwqgo.com/fwq/example" />
<link rel="alternate" hreflang="zh-CN" href="https://fwqgo.com/fwq/example" />
<link rel="alternate" hreflang="en" href="https://fwqgo.com/en/fwq/example" />
```

英文页面（/en/ 前缀）：

```html
<link rel="canonical" href="https://fwqgo.com/en/fwq/example" />
<link rel="alternate" hreflang="zh-CN" href="https://fwqgo.com/fwq/example" />
<link rel="alternate" hreflang="en" href="https://fwqgo.com/en/fwq/example" />
```

## 15. 前台性能策略

前台应采用静态优先策略：

```text
首页：ISR
分类页：ISR
文章页：SSG / ISR
商户页：ISR
服务器配置列表页：ISR + 必要动态筛选
后台 CMS：动态
```

推荐流程：

```text
CMS 写入数据库
-> 发布文章或套餐
-> 触发前台 revalidate
-> Next.js 生成或刷新缓存页面
-> 用户访问缓存后的 HTML
```

避免：

```text
公开前台页面每次访问都强制查数据库
公开前台页面大量使用 no-store
公开前台页面全部 force-dynamic
```

## 16. 部署策略

使用 GitHub Actions 部署。

GitHub Actions 负责：

- 安装依赖
- 类型检查
- lint
- build
- 打包产物
- 上传服务器
- 切换 release

服务器负责：

- Node / PM2 运行
- Nginx
- PostgreSQL
- 图片公开目录
- 图片 webp 转换与优化

注意事项：

- GitHub Actions 减轻服务器 build 压力，但服务器仍需承担运行、数据库、图片处理和后台任务。
- 上传目录必须使用 shared 持久化目录，部署时不得覆盖。
- PostgreSQL 不应开放公网端口。
- CMS 后台可以部署在服务器，但必须通过 `cms.fwqgo.com` 和额外访问控制保护。

## 17. 建议的数据模块

建议核心数据模块：

```text
providers
source_materials
ai_tasks
ai_task_steps
posts
post_translations
server_offers
affiliate_links
outbound_link_rewrites
tags
post_tags
image_assets
ai_write_configs
ai_image_configs
```

其中：

- `source_materials` 保存原始素材和清洗内容。
- `ai_tasks` 保存一次 AI 工作任务。
- `ai_task_steps` 保存每一步状态、输入、输出和错误。
- `server_offers` 保存结构化服务器套餐。
- `affiliate_links` 保存商户、活动、套餐级返利链接。
- `image_assets` 保存上传图片和 AI 生成图片。
- `post_translations` 支持中文主版本和英文可选版本。


## 18. 核心原则

- 推广文章素材生成文章。
- 商户服务器配置信息生成结构化套餐数据。
- 图片是独立资产，需要可管理、可复用、可追溯。
- AI 工作必须可视化、可重试。
- 中文是内容生产主版本，英文也是独立存在，前台多语言全篇统一规范为默认根目录（/）+ /en/ 区分。
- 前台公开页面静态优先，后台 CMS 动态处理。
- 后台使用 `cms.fwqgo.com`，并需要额外访问保护。
