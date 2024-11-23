import Link from "next/link";
import React from "react";

const FooterComponent = () => {
  const footerData = [
    {
      title: "关于我们",
      href: "/about",
      content:
        "服务器go致力于为用户提供最全面、最专业的服务器选购指南和优惠信息。",
    },
    {
      title: "快速链接",
      links: [
        { title: "服务器推荐", href: "/recommendations" },
        { title: "优惠活动", href: "/deals" },
        { title: "评测对比", href: "/comparisons" },
        { title: "使用教程", href: "/tutorials" },
      ],
    },
    {
      title: "特色专区",
      links: [
        { title: "黑五专区", href: "/black-friday" },
        { title: "住宅IP专区", href: "/residential-ip" },
        { title: "出海专区", href: "/overseas-expansion" },
      ],
    },
    {
      title: "联系我们",
      content: "邮箱: info@servergo.com",
    },
  ];
  return (
    <footer className="bg-zinc-100 text-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {footerData.map((item) => (
            <div key={item.title}>
              <h3 className="mb-4">{item.title}</h3>
              {item.content && <p className="text-gray-700">{item.content}</p>}
              {item.links && (
                <ul className="space-y-2">
                  {item.links.map((link) => (
                    <li key={link.title}>
                      <Link
                        href={link.href}
                        className="text-sm font-light text-gray-700 hover:text-white"
                      >
                        {link.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-4 border-t pt-8 text-center text-sm text-zinc-500">
          <Link
            href="https://beian.miit.gov.cn/"
            target="_blank"
            className="hover:text-blue-400"
          >
            沪ICP备2021026034号-5
          </Link>
          <p className="">&copy; 2020-2024 服务器go 保留所有权利。</p>
        </div>
      </div>
    </footer>
  );
};

export default FooterComponent;
