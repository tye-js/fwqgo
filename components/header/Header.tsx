import Link from 'next/link'
import React from 'react'

const Header = () => {
  return (
    <header className="flex justify-around h-20 items-center">
    <section><Link href={"/"}>logo</Link></section>
    <nav><ul className="flex justify-around gap-4 ">
      <li><Link href={"/fwq"} className='hover:text-blue-600'>服务器</Link></li>
      <li>vps</li>
      <li>主机</li>
      <li>信息分享</li>
    </ul></nav>
  </header>
  )
}

export default Header