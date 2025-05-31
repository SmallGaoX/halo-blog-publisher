# Halo MCP服务安装和使用指南

## 功能特性

- ✅ 自动发布文章到Halo博客
- ✅ 根据文章内容智能生成标签和分类
- ✅ 支持Markdown格式文章
- ✅ 自动匹配现有标签和分类
- ✅ 支持自定义文章别名、摘要等
- ✅ 完整的MCP协议支持，可与Claude无缝集成

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
# 创建环境变量文件
cp .env.example .env

# 编辑配置
vim .env
```

在`.env`文件中配置：
- `HALO_BASE_URL`: 你的Halo博客地址
- `HALO_TOKEN`: Halo API访问令牌

### 3. 获取Halo API Token

1. 登录Halo后台管理
2. 进入 "系统" -> "个人资料"
3. 找到 "API令牌" 部分
4. 点击 "新建令牌"
5. 设置合适的权限范围（需要文章、标签、分类的读写权限）
6. 复制生成的Token

### 4. 配置Claude MCP

在Claude的配置文件中添加MCP服务器配置：

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "halo-blog-publisher": {
      "command": "node",
      "args": ["/绝对路径/到/halo-mcp-server.js"],
      "env": {
        "HALO_BASE_URL": "http://your-halo-domain.com",
        "HALO_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### 5. 启动服务

```bash
npm start
```

## 使用方式

### 在Claude中发布文章

你现在可以在Claude中使用以下命令：

#### 发布文章（自动生成标签和分类）
```
请帮我发布一篇文章到博客：
标题：《深入理解JavaScript闭包》
内容：[你的文章内容]
```

#### 发布文章（指定标签和分类）
```
请发布文章：
标题：《Vue3开发实践》
内容：[文章内容]
标签：Vue3, JavaScript, 前端开发
分类：技术分享
```

#### 查看现有标签和分类
```
请列出博客的所有标签
```
```
请列出博客的所有分类
```

## 智能标签和分类生成

### 标签生成逻辑
1. 从文章标题和内容中提取关键词
2. 匹配现有标签
3. 如果匹配数量不足，自动创建新标签
4. 最多生成5个标签

### 分类推断逻辑
根据文章内容关键词自动推断分类：
- **技术**: JavaScript、Python、编程、开发等关键词
- **生活**: 生活、日常、感悟、随笔等关键词  
- **学习**: 学习、教程、笔记、总结等关键词
- **工具**: 工具、软件、应用、效率等关键词
- **思考**: 思考、观点、看法、理解等关键词

如果没有匹配的分类，会创建"默认"分类。

## API接口说明

### publish_post
发布文章到Halo博客

**参数**:
- `title` (必需): 文章标题
- `content` (必需): 文章内容（支持Markdown）
- `excerpt` (可选): 文章摘要
- `slug` (可选): 文章别名，用于URL
- `tags` (可选): 指定标签数组
- `categories` (可选): 指定分类数组
- `allowComment` (可选): 是否允许评论，默认true
- `pinned` (可选): 是否置顶，默认false

### list_tags
获取所有标签列表

### list_categories  
获取所有分类列表

## 故障排除

### 常见问题

1. **API Token权限不足**
   - 确保Token有文章、标签、分类的读写权限

2. **网络连接问题**
   - 检查Halo服务器是否可访问
   - 确认防火墙设置

3. **文章发布失败**
   - 检查文章标题是否重复
   - 确认内容格式是否正确

### 调试模式

启用调试模式查看详细日志：
```bash
npm run dev
```

## 扩展功能

你可以根据需要扩展以下功能：
- 图片上传支持
- 文章定时发布
- 批量导入文章
- 自定义文章模板
- SEO优化设置

## 技术栈

- Node.js
- MCP SDK
- Halo REST API
- 智能内容分析

## 许可证

MIT License
