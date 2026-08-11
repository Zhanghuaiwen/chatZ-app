# ChatZ - AI 对话助手

基于 React + Vite 构建的类 ChatGPT 对话应用，支持**本地 Ollama** 和 **SiliconFlow 云 API** 双后端切换。

> React 19 · Vite 8 · 流式输出 · 双主题 · localStorage 持久化

## 目录

- [功能特性](#功能特性)
- [支持的模型](#支持的模型)
- [快速开始](#快速开始)
- [部署 Ollama 本地模型](#部署-ollama-本地模型)
- [代理配置](#代理配置)
- [项目结构](#项目结构)
- [使用说明](#使用说明)
- [常见问题](#常见问题)
- [更新记录](#更新记录)
- [技术栈](#技术栈)

## 功能特性

- **双 AI 来源**：一键切换本地 Ollama（完全离线）或 SiliconFlow 云端免费模型
- **流式输出**：实时流式打印 AI 回复，类 ChatGPT 体验
- **深色/浅色主题**：卡片式界面，支持深色与浅色两套主题一键切换，选择自动保存
- **卡片式侧边栏**：侧边栏以悬浮卡片呈现，收起时向左平滑滑出消失，带层次阴影
- **多对话管理**：侧边栏管理多个对话，支持创建、切换、删除
- **Markdown 渲染**：支持代码块、列表、表格、引用、标题等 Markdown 语法
- **快捷操作**：欢迎页预设快捷提问按钮
- **移动端适配**：响应式布局，移动端侧边栏以抽屉形式滑入滑出
- **连接测试**：设置面板内置 Ollama 连接测试按钮，快速诊断问题
- **本地持久化**：对话记录、设置和主题自动保存至浏览器 localStorage

## 支持的模型

### 本地 Ollama（需安装 [Ollama](https://ollama.com)）

| 模型 ID                     | 说明                    |
| --------------------------- | ----------------------- |
| `deepseek-coder-v2:latest` | Deepseek-coder-v2 (默认) |

运行 `ollama pull deepseek-coder-v2:latest` 下载模型后即可使用。

### SiliconFlow 云 API（[免费注册](https://cloud.siliconflow.cn/account/ak)）

| 模型 ID                             | 说明              |
| ----------------------------------- | ----------------- |
| `deepseek-ai/DeepSeek-V4-Pro`      | DeepSeek V4 Pro (付费) |
| `tencent/Hunyuan-MT-7B`             | 腾讯混元翻译      |
| `deepseek-ai/DeepSeek-OCR`          | DeepSeek OCR      |

## 快速开始

### 前置要求

- Node.js >= 18

### 安装和运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器访问 http://localhost:5173 即可使用。

### 构建生产版本

```bash
npm run build
npm run preview   # 预览生产构建
```

### 代码检查

```bash
npm run lint
```

## 部署 Ollama 本地模型

### 1. 安装 Ollama

从 [ollama.com](https://ollama.com) 下载 Windows 安装包并安装。

### 2. 启动 Ollama 服务

Ollama 安装后默认注册为 Windows 系统服务，自动开机启动。如未启动，可手动运行：

```powershell
ollama serve
```

### 3. 下载模型

```powershell
# 下载 Qwen2.5 7B 模型（约 4.7 GB）
ollama pull qwen2.5:7b

# 查看已下载的模型
ollama list
```

### 4. 验证 Ollama 是否正常工作

```powershell
# 测试 API 是否响应
curl http://127.0.0.1:11434/api/tags

# 测试流式对话
curl -X POST http://127.0.0.1:11434/api/chat -d "{\"model\":\"deepseek-coder-v2:latest\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}],\"stream\":true}"
```

## 代理配置

Vite 开发服务器通过代理转发 AI API 请求，无需处理跨域。配置在 `vite.config.js`：

| 前端路径    | 代理目标                          |
| ----------- | --------------------------------- |
| `/api/*`    | `https://api.siliconflow.cn/v1/*` |
| `/ollama/*` | `http://127.0.0.1:11434/*`        |

## 项目结构

```
chatz-app/
├── index.html              # 入口 HTML
├── vite.config.js          # Vite 配置（插件、代理）
├── src/
│   ├── main.jsx            # React 入口
│   ├── App.jsx             # 主应用组件（状态管理、发送逻辑、主题切换）
│   ├── App.css             # 应用外壳布局（侧边栏槽位、主卡片、聊天头部）
│   ├── index.css           # 全局样式（主题变量、基础样式、共享 .icon-btn）
│   ├── constants.js        # 常量定义（模型列表、系统提示词、默认设置）
│   ├── utils.js            # 工具函数（localStorage、Markdown 渲染）
│   ├── services/
│   │   └── chat.js         # 接口层（请求构建、SSE 流解析、错误提取）
│   └── components/
│       ├── SettingsModal.jsx   # 设置弹窗（切换来源/模型/API Key）
│       ├── SettingsModal.css   # 设置弹窗样式
│       ├── Sidebar.jsx         # 侧边栏（对话列表、设置、主题切换）
│       ├── Sidebar.css         # 侧边栏样式
│       ├── InputArea.jsx       # 输入区域（文本框、发送/停止按钮）
│       ├── InputArea.css       # 输入区域样式
│       ├── ChatWindow.jsx      # 聊天窗口（消息列表、欢迎页）
│       └── ChatWindow.css      # 消息/欢迎页样式
└── README.md
```

## 使用说明

1. **切换 AI 来源**：点击左下角"设置"按钮，选择"本地 Ollama"或"SiliconFlow 云 API"
2. **选择模型**：在设置面板中选择当前来源下的可用模型
3. **API Key**：使用 SiliconFlow 时需填写 API Key（可从 [SiliconFlow 控制台](https://cloud.siliconflow.cn/account/ak) 免费获取）
4. **测试连接**：使用 Ollama 时可点击"测试连接"按钮验证服务是否正常运行
5. **切换主题**：点击侧边栏底部"切换主题"按钮，在深色/浅色主题间切换
6. **收起侧边栏**：点击侧边栏顶部的收起按钮（`‹`），卡片向左滑出；点击左上角汉堡按钮重新展开
7. **发送消息**：输入文本后按 Enter 发送，Shift+Enter 换行
8. **停止生成**：AI 回复时可点击红色方块按钮停止流式输出
9. **管理对话**：侧边栏显示所有对话，可点击切换、悬停显示删除按钮

## 常见问题

**Q: 页面报错"请求失败"**
A: 打开设置面板，确认已选择正确的来源和模型。如使用 Ollama，点击"测试连接"按钮诊断。检查 Ollama 服务是否正在运行。

**Q: Ollama 报错 "model not found"**
A: 在设置面板中切换一下来源（选回 Ollama），确保模型下拉框显示的是 `deepseek-coder-v2:latest`。运行 `ollama list` 确认模型已下载。

**Q: 外部浏览器无法连接 Ollama，VS Code 内部浏览器正常**
A: 因为 `vite.config.js` 中已配置代理覆写 `Origin` 头，重启开发服务器后重试。

## 更新记录

### v0.1.2

- **代码重构**：提取 `src/services/chat.js` 接口层（请求构建 / SSE 流解析 / 错误提取），拆分 `App.jsx` 中过长的 `sendMessage`，统一对话更新模式，删除调试日志与未使用的资源，不改变任何外部行为。

### v0.1.1

- **修复侧边栏收起时左侧残留黑色细线**：收起动画期间，侧边栏的 `1px` 描边会一直贴合在收缩中的裁剪边缘，直到宽度归零，视觉上表现为左侧一条黑色细线/闪现的黑色细框。
  - 根因：`.sidebar-slot` 宽度与侧边栏位移同步收缩，侧边栏右边框始终贴合裁剪边界。
  - 修复：收起态下边框渐隐为透明（`border-color: transparent`，`0.25s`），同时透明度淡出加快到 `0.25s`，确保所有深色边缘像素在槽位收窄至 0 前完全消失。
  - 涉及文件：`src/App.css`

## 技术栈

| 类别     | 技术                       |
| -------- | -------------------------- |
| 框架     | React 19                   |
| 构建工具 | Vite 8                     |
| 语言     | JavaScript (JSX)           |
| 样式     | 原生 CSS（CSS 变量主题）   |
| 数据存储 | 浏览器 localStorage        |
| 代码检查 | oxlint                     |

