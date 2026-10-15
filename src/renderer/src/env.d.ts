/// <reference types="vite/client" />

// CSS 副作用导入（Tailwind 入口等）
declare module '*.css' {
  const content: string
  export default content
}
