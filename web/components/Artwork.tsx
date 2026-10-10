export function Logo() {
  return <span className="brand"><b aria-hidden="true">♡</b> Pergi<span>Berdua</span><i>.</i></span>;
}
export function Artwork({kind = 'Alam'}: {kind?: string}) {
  return <svg viewBox="0 0 600 340" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <rect width="600" height="340" fill="#d1dac5"/><circle cx="453" cy="72" r="43" fill="#f1e7c6"/>
    {kind === 'Kuliner' ? <>
      <rect width="600" height="340" fill="#e4cfbb"/><rect x="82" y="68" width="440" height="232" fill="#f1e5d0"/>
      <rect x="119" y="117" width="157" height="130" fill="#597162"/><rect x="317" y="117" width="155" height="183" fill="#597162"/>
      <path d="M83 64H520L545 115H58Z" fill="#987168"/><path d="M130 66L118 115M200 66L194 115M270 66V115M340 66L346 115M410 66L422 115M480 66L498 115" stroke="#dbbfa2" strokeWidth="24"/>
      <path d="M199 117V248M119 185H276M392 117V300" stroke="#dfccb0" strokeWidth="6"/><ellipse cx="234" cy="283" rx="55" ry="12" fill="#8a7058"/>
      <path d="M234 289V336" stroke="#745c48" strokeWidth="7"/><rect x="215" y="258" width="17" height="20" rx="3" fill="#fff4df"/><rect x="244" y="258" width="17" height="20" rx="3" fill="#fff4df"/>
    </> : kind === 'Seni & budaya' ? <>
      <rect width="600" height="340" fill="#dad1e4"/><path d="M0 0L65 40V270L0 340M600 0L535 40V270L600 340" fill="#c2b4d0"/>
      <rect y="270" width="600" height="70" fill="#b4a4c0"/><rect x="135" y="53" width="157" height="181" fill="#f3e6cc"/><rect x="147" y="65" width="133" height="157" fill="#9a82ae"/>
      <circle cx="210" cy="115" r="29" fill="#e8c59b"/><path d="M148 220L185 132L230 181L280 142V221" fill="#66527c"/><rect x="352" y="88" width="91" height="115" fill="#b37e6c"/><path d="M370 179Q414 94 430 148" stroke="#eadab6" strokeWidth="10" fill="none"/>
    </> : <>
      <path d="M0 185Q140 99 300 170T600 127V340H0Z" fill="#a7b49a"/><path d="M0 245Q146 157 307 219T600 205V340H0Z" fill="#879d77"/>
      <path d="M244 340Q402 269 298 238Q213 215 352 179Q243 203 261 235Q288 268 132 340" fill="#e9dfc1"/>
      <g fill="#577357"><ellipse cx="70" cy="131" rx="38" ry="80"/><ellipse cx="119" cy="100" rx="30" ry="65"/><ellipse cx="535" cy="119" rx="46" ry="89"/></g>
      <path d="M70 120V272M119 105V249M535 110V283" stroke="#45634c" strokeWidth="5"/><path d="M173 209V126L240 82L306 126V209Z" fill="#e5e8d3" stroke="#7e8e7b" strokeWidth="4"/>
      <path d="M174 126H306M240 82V209M200 109V209M279 109V209M174 167H306" stroke="#9ba993" strokeWidth="3"/>
      <g transform="translate(356 260)"><circle cy="-29" r="8" fill="#c99f80"/><path d="M-8-17H8L12 15H-11Z" fill="#574571"/><path d="M-4 15L-8 37M6 15L11 37" stroke="#3f4a41" strokeWidth="5"/>
        <circle cx="29" cy="-26" r="8" fill="#c99f80"/><path d="M21-14H38L43 17H17Z" fill="#e7d7b4"/><path d="M24 17L22 37M35 17L39 37" stroke="#3f4a41" strokeWidth="5"/><path d="M9-5L18 6L22-3" stroke="#c99f80" strokeWidth="4" fill="none"/></g>
    </>}
  </svg>;
}
