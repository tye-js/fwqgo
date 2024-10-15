import React from 'react'

const FwqLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (<section>{children}</section>
  )
}

export default FwqLayout