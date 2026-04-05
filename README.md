# 团建经费记录系统

一个前后端分离的团建经费管理示例项目，支持：

- 按部门、按季度查看季度团建预算和剩余经费
- 清晰区分季度团建与创新专项经费
- 按季度、按部门、按类型查看明细汇总
- 录入部门季度人数、季度团建支出、创新专项申请和核销

## 目录结构

```text
.
├─ frontend   React + Vite 前端
└─ backend    Express API + 本地 JSON 数据
```

## 启动方式

打开两个终端分别执行：

```bash
npm run dev:backend
npm run dev:frontend
```

默认地址：

- 前端：`http://localhost:3210`
- 后端：`http://localhost:3201`

## 说明

- 季度团建预算按“部门人数 x 150 元/人/季度”自动计算
- 创新专项经费与季度团建独立统计，不占用季度团建预算
- 后端使用 `backend/data/store.json` 作为本地示例数据存储
