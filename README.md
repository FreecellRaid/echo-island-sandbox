# 回声岛代码节点留档

（会有这个 repo 大概是为了方便岛主 code review ，大概不会有别人用得到……吧？）

使用时把需要的 component/composable 挂在根组件上再 build ，打包时会自动排除 vue3 runtime 和 mock。  
因为我不习惯，没装tailwind，如果要用需要自己配一下

## 项目结构

`mocks/` 回声岛接口本地模拟，可以在`mockVariables.ts`中配置变量数值

`eiRateLimit.ts` 基础的节流/防抖/GM锁  
`eiSubscribe.ts` 对EI.subscribe接口的去重封装  
`eiThemeSync.ts` 主题判断工具(写入变量)

`ApiTestPanel.vue` 测试用面板

`useSpeakerRecorder.ts` 发言顺序记录  
`SpeakerRecorderTestPanel.vue` 发言顺序记录测试面板

`DataTransformer.vue` 数据导入/导出工具

`Timer.vue` 计时器

`customCursor/`自定义光标及测试面板
