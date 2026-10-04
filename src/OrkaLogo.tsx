import type { SVGProps } from 'react'

export type OrkaLogoState = 'idle' | 'listening' | 'thinking' | 'speaking'

type OrkaLogoProps = SVGProps<SVGSVGElement> & {
  state?: OrkaLogoState
  title?: string
}

export function OrkaLogo({ state = 'idle', title = 'Orka', className = '', ...props }: OrkaLogoProps) {
  return (
    <svg
      viewBox="0 0 113 123"
      preserveAspectRatio="xMidYMid meet"
      className={`orka-logo ${className}`.trim()}
      data-state={state}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path className="orka-body" d="M52 10h8v1h-8zM45 11h23v1h-23zM42 12h29v1h-29zM39 13h36v1h-36zM37 14h40v1h-40zM35 15h45v1h-45zM33 16h49v1h-49zM32 17h52v1h-52zM30 18h55v1h-55zM29 19h58v1h-58zM28 20h60v1h-60zM27 21h62v1h-62zM26 22h64v1h-64zM25 23h66v1h-66zM24 24h68v1h-68zM23 25h70v2h-70zM22 27h72v1h-72zM21 28h73v1h-73zM21 29h74v1h-74zM49 30h46v1h-46zM20 30h23v1h-23zM53 31h42v1h-42zM19 31h20v1h-20zM19 32h18v1h-18zM19 33h15v1h-15zM55 32h40v3h-40zM18 34h15v1h-15zM18 35h14v1h-14zM71 35h24v1h-24zM70 36h25v1h-25zM17 36h13v1h-13zM54 35h13v2h-13zM17 37h12v1h-12zM53 37h42v1h-42zM17 38h11v1h-11zM52 38h43v1h-43zM51 39h43v1h-43zM16 39h11v1h-11zM49 40h45v1h-45zM16 40h10v2h-10zM48 41h46v1h-46zM16 42h9v1h-9zM78 42h15v1h-15zM46 42h23v1h-23zM84 43h9v1h-9zM44 43h19v1h-19zM16 43h8v1h-8zM15 44h9v1h-9zM27 44h33v1h-33zM87 44h5v1h-5zM25 45h32v1h-32zM15 45h8v1h-8zM88 45h3v1h-3zM87 46h3v1h-3zM15 46h40v1h-40zM15 47h38v1h-38zM87 47h2v1h-2zM86 48h2v1h-2zM15 48h37v1h-37zM85 49h2v1h-2zM15 49h35v1h-35zM15 50h34v1h-34zM84 50h2v1h-2zM83 51h1v1h-1zM15 51h32v1h-32zM82 52h1v1h-1zM15 52h31v1h-31zM16 53h29v1h-29zM16 54h28v1h-28zM16 55h27v2h-27zM17 57h25v1h-25zM17 58h24v2h-24zM17 60h23v1h-23zM18 61h22v1h-22zM18 62h21v1h-21zM19 63h20v1h-20zM19 64h19v1h-19zM20 65h18v1h-18zM21 66h17v1h-17zM22 67h16v1h-16zM23 68h15v1h-15zM24 69h14v1h-14zM25 70h14v1h-14zM26 71h13v1h-13zM27 72h13v1h-13zM29 73h11v1h-11zM30 74h11v1h-11zM32 75h10v1h-10zM34 76h10v1h-10zM37 77h9v1h-9zM41 78h7v1h-7zM18 83h10v1h-10zM16 84h15v1h-15zM15 85h17v1h-17zM13 86h20v1h-20zM12 87h22v1h-22zM11 88h9v1h-9zM27 88h8v1h-8zM29 89h7v1h-7zM11 89h7v1h-7zM96 90h4v1h-4zM10 90h7v1h-7zM84 90h8v1h-8zM42 90h4v1h-4zM51 90h3v1h-3zM71 90h6v1h-6zM30 90h6v1h-6zM95 91h6v1h-6zM69 91h8v1h-8zM41 91h6v1h-6zM10 91h6v1h-6zM48 91h6v1h-6zM82 91h12v1h-12zM31 91h6v2h-6zM81 92h20v1h-20zM68 92h8v1h-8zM9 92h6v2h-6zM80 93h21v1h-21zM67 93h8v1h-8zM79 94h22v1h-22zM66 94h8v1h-8zM41 92h13v3h-13zM79 95h7v1h-7zM32 93h6v3h-6zM65 95h8v1h-8zM41 95h12v1h-12zM91 95h10v1h-10zM93 96h8v1h-8zM41 96h8v1h-8zM57 83h6v14h-6zM78 96h7v1h-7zM64 96h7v1h-7zM57 97h14v1h-14zM78 97h6v1h-6zM41 97h7v1h-7zM33 96h5v2h-5zM94 97h7v2h-7zM9 94h5v6h-5zM57 98h12v3h-12zM32 98h6v3h-6zM95 99h6v3h-6zM9 100h6v2h-6zM57 101h13v1h-13zM57 102h14v1h-14zM31 101h6v2h-6zM10 102h6v1h-6zM78 98h5v5h-5zM57 103h7v1h-7zM10 103h7v1h-7zM30 103h6v1h-6zM65 103h7v1h-7zM94 102h7v2h-7zM93 104h8v1h-8zM66 104h7v1h-7zM11 104h7v1h-7zM29 104h7v1h-7zM78 103h6v2h-6zM67 105h6v1h-6zM78 105h8v1h-8zM11 105h9v1h-9zM92 105h9v1h-9zM27 105h8v1h-8zM79 106h9v1h-9zM68 106h6v1h-6zM12 106h22v1h-22zM89 106h12v1h-12zM80 107h21v1h-21zM68 107h7v1h-7zM13 107h20v1h-20zM69 108h7v1h-7zM14 108h18v1h-18zM81 108h20v1h-20zM70 109h7v1h-7zM41 98h6v12h-6zM82 109h12v1h-12zM16 109h15v1h-15zM18 110h11v1h-11zM95 109h6v2h-6zM57 104h6v7h-6zM84 110h8v1h-8zM42 110h5v1h-5zM71 110h6v1h-6zM22 111h3v1h-3z
" />
      <g className="orka-cutout" aria-hidden="true">
        <path d="M23 37c7-7 17-9 28-6-4 6-12 10-21 11-3 0-5-2-7-5Z" />
        <path d="M41 62c9-10 22-16 37-18 7 0 12 2 14 5-8 6-18 10-28 13-11 4-17 9-22 15-3-5-3-10-1-15Z" />
      </g>
      <circle className="orka-accent" cx="69.5" cy="36.5" r="1.7" />
    </svg>
  )
}
