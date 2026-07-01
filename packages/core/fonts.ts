import { Inter } from "next/font/google";

// 配置 Inter 字体
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // 预加载常用字重
  weight: ["400", "500", "600", "700"],
  // 启用字体优化
  preload: true,
  // 减少字体闪烁
  fallback: ["system-ui", "arial"],
});

// 导出字体类名
export const fontSans = inter.variable;
