"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PiRocketLight } from "react-icons/pi";

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
      className="fixed bottom-8 right-4 z-50 rounded-full bg-white/80 shadow-lg backdrop-blur-sm hover:bg-white/90"
      onClick={scrollToTop}
      aria-label="回到顶部"
    >
      <PiRocketLight className="h-6 w-6 md:h-8 md:w-8" />
    </Button>
  );
}
