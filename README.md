## 回声岛代码节点留档

（大概是为了方便岛主review）

使用时把需要的 component/composable 挂在根组件上再 build / dev，打包时会自动排除 vue3 runtime 和 mock，因为我不习惯，没装tailwind，如果要用需要自己配一下

`mocks/` 回声岛接口本地模拟，可以在`mockVariables.ts`中配置变量数值

`eiRateLimit.ts` 基础的节流/防抖/GM锁

`EchoIslandTestCard.vue` 环境测试

`useSpeakerRecorder.ts` 发言顺序记录  
`SpeakerRecorderTestPanel.vue` 发言顺序记录测试面板

`DataTransformer.vue` 数据导入/导出工具

`Timer.vue` 计时器

`customCursor/`自定义光标及测试面板
