import Link from "next/link";
import React from "react";

const FooterComponent = () => {
  return (
    <div className="container mx-auto flex h-14 items-center justify-center gap-6 text-xs text-gray-400">
      <Link
        href="https://beian.miit.gov.cn/"
        target="_blank"
        className="hover:text-blue-400"
      >
        沪ICP备2021026034号-5
      </Link>
      <span>© 2022-2024</span>
    </div>
  );
};

export default FooterComponent;
