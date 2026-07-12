"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  // 检查滚动位置
  const toggleVisibility = () => {
    if (window.scrollY > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  // 滚动到顶部
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    window.addEventListener("scroll", toggleVisibility);
    return () => {
      window.removeEventListener("scroll", toggleVisibility);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <Button
      variant="outline"
      size="icon"
      className="fixed bottom-8 right-4 z-50 size-11 rounded-full bg-background/90 shadow-lg backdrop-blur-sm hover:bg-muted"
      onClick={scrollToTop}
      aria-label="回到顶部"
    >
      <ArrowUp className="size-5" />
    </Button>
  );
}
