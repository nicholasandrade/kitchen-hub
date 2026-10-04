import type { SVGProps } from 'react'

export type OrkaLogoState = 'idle' | 'listening' | 'thinking' | 'speaking'

type OrkaLogoProps = SVGProps<SVGSVGElement> & {
  state?: OrkaLogoState
  title?: string
}

export function OrkaLogo({ state = 'idle', title = 'Orka', className = '', ...props }: OrkaLogoProps) {
  return (
    <svg
      viewBox="0 0 512 650"
      preserveAspectRatio="xMidYMid meet"
      className={`orka-logo ${className}`.trim()}
      data-state={state}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        className="orka-body"
        d="M404 118C364 77 305 56 244 63C177 70 120 110 92 166C61 228 68 304 110 359C147 407 207 434 269 428C334 422 391 383 419 328C444 279 447 220 428 171C421 152 413 134 404 118Z"
      />
      <g className="orka-cutout" aria-hidden="true">
        <path d="M155 208C177 176 209 157 247 153C268 151 290 155 309 165C286 174 267 188 251 207C230 232 209 244 181 244C164 244 149 240 137 234C143 225 149 216 155 208Z" />
        <path d="M179 330C213 298 257 278 304 274C344 271 380 278 409 295C387 337 350 368 306 381C260 394 210 388 169 363C170 351 173 340 179 330Z" />
        <path d="M300 279C324 266 351 260 378 262C394 263 408 266 419 271C407 284 394 294 378 301C351 313 323 315 297 308C291 301 292 287 300 279Z" />
        <path d="M0 350C80 335 120 340 169 363C210 386 260 394 306 381C350 368 387 337 409 295C452 304 488 331 512 365V512H0Z" />
      </g>
      <ellipse className="orka-accent" cx="326" cy="190" rx="10" ry="8" />
      <text className="orka-wordmark" x="256" y="602" textAnchor="middle">Orka</text>
    </svg>
  )
}
