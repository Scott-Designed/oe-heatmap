import { useState, useEffect, useRef, useCallback, useMemo } from "react"

// ── Colour utilities ──────────────────────────────────────────────────────────
function lerp(a,b,t){return a+(b-a)*t}
function interp(stops,t){
  t=Math.max(0,Math.min(1,t))
  for(let i=1;i<stops.length;i++){
    const[s0,c0]=stops[i-1],[s1,c1]=stops[i]
    if(t<=s1){const f=(t-s0)/(s1-s0);return`rgb(${Math.round(lerp(c0[0],c1[0],f))},${Math.round(lerp(c0[1],c1[1],f))},${Math.round(lerp(c0[2],c1[2],f))})`}
  }
  const l=stops[stops.length-1][1];return`rgb(${l[0]},${l[1]},${l[2]})`
}
const SCALES={
  renewables:[[0,[13,17,23]],[0.15,[26,42,31]],[0.35,[20,83,45]],[0.55,[22,101,52]],[0.75,[21,128,61]],[0.88,[34,197,94]],[1,[134,239,172]]],
  carbon:    [[0,[134,239,172]],[0.20,[34,197,94]],[0.40,[253,224,71]],[0.60,[249,115,22]],[0.80,[220,38,38]],[1,[127,29,29]]],
  solar:     [[0,[13,14,16]],[0.15,[50,40,10]],[0.35,[120,80,10]],[0.60,[200,150,20]],[0.80,[240,200,50]],[1,[255,240,130]]],
  wind:      [[0,[13,14,16]],[0.20,[10,40,55]],[0.45,[10,90,120]],[0.70,[20,160,180]],[1,[100,230,240]]],
  gas:       [[0,[13,14,16]],[0.20,[50,25,10]],[0.45,[160,70,20]],[0.70,[220,120,40]],[1,[255,180,80]]],
  coal:      [[0,[13,14,16]],[0.25,[35,30,28]],[0.50,[80,70,65]],[0.75,[140,130,122]],[1,[210,200,190]]],
  battery:   [[0,[13,14,16]],[0.20,[10,20,60]],[0.45,[30,60,180]],[0.70,[80,120,230]],[1,[180,210,255]]],
}
const SCALES_LIGHT={
  renewables:[[0,[235,245,238]],[0.25,[180,220,190]],[0.50,[100,180,130]],[0.75,[34,130,80]],[1,[14,80,40]]],
  carbon:    [[0,[14,100,50]],[0.25,[100,180,80]],[0.50,[240,200,60]],[0.75,[220,100,30]],[1,[150,20,20]]],
  solar:     [[0,[255,250,230]],[0.25,[245,220,150]],[0.55,[230,170,40]],[0.80,[190,120,10]],[1,[120,70,0]]],
  wind:      [[0,[225,245,250]],[0.25,[160,220,235]],[0.55,[50,170,200]],[0.80,[10,120,160]],[1,[5,70,110]]],
  gas:       [[0,[255,245,235]],[0.25,[250,210,170]],[0.55,[230,140,60]],[0.80,[190,90,20]],[1,[130,50,0]]],
  coal:      [[0,[245,244,242]],[0.25,[210,205,200]],[0.55,[160,150,142]],[0.80,[100,90,84]],[1,[45,38,34]]],
  battery:   [[0,[235,240,255]],[0.25,[190,205,250]],[0.55,[120,150,230]],[0.80,[50,90,200]],[1,[20,40,150]]],
}
const LEGEND={
  renewables:{lo:'0%',hi:'100%'},
  carbon:    {lo:'0 g',hi:'800 gCO\u2082/kWh'},
  solar:     {lo:'0%',hi:'>50%'},
  wind:      {lo:'0%',hi:'>50%'},
  gas:       {lo:'0%',hi:'>50%'},
  coal:      {lo:'0%',hi:'>50%'},
  battery:   {lo:'0%',hi:'>15%'},
}
function metricColor(metric,val,dark=true){
  const sc=dark?SCALES[metric]:SCALES_LIGHT[metric]
  if(metric==='carbon')return interp(sc,val/800)
  if(metric==='renewables')return interp(sc,val/100)
  if(metric==='battery')return interp(sc,Math.min(1,val/15))
  return interp(sc,Math.min(1,val/50))
}
function metricNorm(metric,val){
  if(metric==='carbon')return Math.min(1,val/800)
  if(metric==='renewables')return Math.min(1,val/100)
  if(metric==='battery')return Math.min(1,val/15)
  return Math.min(1,val/50)
}
function quantizedColor(metric,val,dark,numBands){
  // numBands=null means smooth/continuous
  const n=metricNorm(metric,val)
  const sc=dark?SCALES[metric]:SCALES_LIGHT[metric]
  if(!numBands||numBands>=16)return interp(sc,n)
  const band=Math.floor(n*numBands)/numBands + 0.5/numBands
  return interp(sc,Math.min(1,band))
}
function tooltipLabel(metric,val){
  if(metric==='carbon')return`${Math.round(val)} gCO\u2082/kWh (est.)`
  return`${val.toFixed(1)}% ${metric}`
}

// ── 5×7 pixel bitmap font ─────────────────────────────────────────────────────
// Each char: 7 rows, each row is a 5-bit number (MSB = leftmost pixel)
const FONT5={
  A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14],
  D:[28,18,17,17,17,18,28], E:[31,16,16,30,16,16,31], F:[31,16,16,30,16,16,16],
  G:[14,17,16,23,17,17,14], H:[17,17,17,31,17,17,17], I:[14,4,4,4,4,4,14],
  J:[1,1,1,1,1,17,14],      K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31],
  M:[17,27,21,17,17,17,17], N:[17,25,21,19,17,17,17], O:[14,17,17,17,17,17,14],
  P:[30,17,17,30,16,16,16], Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17],
  S:[14,17,16,14,1,17,14],  T:[31,4,4,4,4,4,4],       U:[17,17,17,17,17,17,14],
  V:[17,17,17,17,17,10,4],  W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17],
  Y:[17,17,10,4,4,4,4],     Z:[31,1,2,4,8,16,31],
  '.':[0,0,0,0,0,0,4],      ',':[0,0,0,0,0,4,8],       '-':[0,0,0,31,0,0,0],
  "'":[4,4,0,0,0,0,0],      '!':[4,4,4,4,4,0,4],       '?':[14,17,1,6,4,0,4],
  ' ':[0,0,0,0,0,0,0],
}
const METRIC_TEXT={
  renewables:'RENEWABLES', solar:'SOLAR', wind:'WIND',
  gas:'GAS', coal:'COAL', carbon:'CARBON', battery:'BATTERY',
}
// Returns array of {c,r} grid cells that spell out `text` centered in cols×rows
function buildTextCells(text,cols,rows){
  const chars=text.toUpperCase().split('')
  // Scale: font pixel = pixH rows tall, pixW cols wide (compensate for cell aspect)
  const pixH=Math.max(1,Math.floor(rows*0.72/7))
  const charCols=5,gap=1,charW=(charCols+gap)
  const totalFontCols=chars.length*charW-gap
  const pixW=Math.max(1,Math.round(pixH*(rows/7)/(cols/(totalFontCols*pixH/pixH*1.0)*1.0)*0.18))
  // simpler: aim for text to occupy ~70% of cols
  const pixW2=Math.max(1,Math.floor(cols*0.70/(totalFontCols)))
  const totalW=totalFontCols*pixW2
  const startC=Math.floor((cols-totalW)/2)
  const startR=Math.floor((rows-7*pixH)/2)
  const cells=[]
  chars.forEach((ch,ci)=>{
    const glyph=FONT5[ch]||FONT5[' ']
    const charStartC=startC+ci*charW*pixW2
    glyph.forEach((row,ry)=>{
      for(let bx=0;bx<5;bx++){
        if(!(row>>(4-bx)&1))continue
        for(let pr=0;pr<pixH;pr++)for(let pc=0;pc<pixW2;pc++){
          const c=charStartC+bx*pixW2+pc
          const r=startR+ry*pixH+pr
          if(c>=0&&c<cols&&r>=0&&r<rows)cells.push({c,r})
        }
      }
    })
  })
  return cells
}
// Simplified clockwise polygon, normalized 0-1 (x=longitude, y=latitude top-to-bottom)
const AUS_POLY=[
  // NW coast going clockwise
  [0.17,0.10],[0.20,0.05],[0.22,0.02],[0.28,0.00],[0.36,0.00],
  // Top NT coast, Arnhem Land notch
  [0.44,0.02],[0.47,0.07],[0.50,0.04],[0.54,0.00],
  // Gulf of Carpentaria — big bite inward
  [0.57,0.02],[0.59,0.10],[0.59,0.22],[0.57,0.30],
  // Cape York peninsula
  [0.61,0.30],[0.64,0.15],[0.66,0.05],[0.69,0.00],[0.71,0.04],
  // QLD east coast south
  [0.76,0.18],[0.82,0.35],[0.87,0.50],[0.92,0.62],
  [0.94,0.70],[0.93,0.78],
  // NSW coast — slight bump for Sydney
  [0.90,0.84],[0.86,0.89],[0.82,0.93],[0.77,0.96],
  [0.72,0.99],[0.68,1.00],
  // Victorian coast — Melbourne notch
  [0.62,1.00],[0.58,0.95],[0.54,0.93],[0.49,0.92],
  // SA — Spencer Gulf indentations
  [0.43,0.90],[0.37,0.89],[0.32,0.86],
  [0.30,0.82],[0.27,0.76],[0.24,0.81],[0.21,0.86],
  // Great Australian Bight
  [0.17,0.83],[0.13,0.76],[0.07,0.68],[0.02,0.60],
  // WA south-west corner, north
  [0.00,0.52],[0.00,0.42],[0.03,0.33],[0.07,0.25],
  [0.11,0.18],[0.14,0.13],[0.17,0.10],
]
// Tasmania (separate island, sits below mainland)
const TAS_POLY=[
  [0.63,1.06],[0.65,1.03],[0.67,1.02],[0.70,1.03],
  [0.72,1.06],[0.71,1.10],[0.68,1.12],[0.64,1.10],
]

function pointInPoly(x,y,poly){
  let inside=false
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const[xi,yi]=poly[i],[xj,yj]=poly[j]
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside
  }
  return inside
}
function buildAusMask(cols,rows){
  const mask=new Uint8Array(cols*rows)
  for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
    const nx=(c+0.5)/cols,ny=(r+0.5)/rows
    if(pointInPoly(nx,ny,AUS_POLY)||pointInPoly(nx,ny,TAS_POLY))mask[c*rows+r]=1
  }
  return mask
}

// ── Pixel art sprites ─────────────────────────────────────────────────────────
// Each sprite: array of strings, '1'=filled, '0'=empty, ' '=skip(transparent bg)
// All 11×11 pixels
const SPRITES={
  solar:[
    '00010100100',
    '00001010000',
    '01000000010',
    '00011100000',
    '10001110001',  // horizon rays + body
    '10011111001',
    '10001110001',
    '00011100000',
    '01000000010',
    '00001010000',
    '00010100100',
  ],
  wind:[
    '00000100000',
    '00001100000',  // blade up-left
    '00011110000',
    '00111010000',
    '01110011111',  // hub row + right blade
    '00010000000',
    '00010000000',
    '00011000000',
    '00011000000',
    '00011100000',
    '01111111100',  // base
  ],
  renewables:[
    '00001000000',
    '00011100000',
    '00111110000',
    '01111111000',
    '11111111100',
    '00100100000',  // stem
    '00100100000',
    '00111100000',
    '01100110000',
    '11000011000',
    '00000000000',
  ],
  gas:[
    '00100000100',  // flame tips
    '01110001110',
    '01111011110',
    '11111111111',
    '11111111111',
    '01111111110',
    '00111111100',
    '00011111000',
    '00001110000',
    '00000100000',
    '00000000000',
  ],
  coal:[
    '01100001100',  // smoke puffs
    '11110011110',
    '01100001100',
    '00000000000',
    '00111111000',  // stack opening
    '00100001000',
    '00100001000',
    '00100001000',
    '00100001000',
    '00100001000',
    '11111111111',  // base
  ],
  carbon:[
    '00010100000',  // CO₂ — factory + cloud
    '00111110000',
    '01111111000',
    '00111110000',
    '00010000000',
    '00010000000',
    '01111111110',  // factory roof
    '01001001010',
    '01001001010',
    '01001001010',
    '11111111111',
  ],
  battery:[
    '00111111100',
    '00100000100',
    '11100000111',
    '11101110111',
    '11101110111',
    '11101110111',
    '11100000111',
    '11101110111',
    '11101110111',
    '11100000111',
    '00111111100',
  ],
}

// Colour for each sprite (always bright regardless of dark/light mode)
const SPRITE_COLORS={
  solar:'#fde047',wind:'#7dd3fc',renewables:'#4ade80',
  gas:'#fb923c',coal:'#d4d0c8',carbon:'#f87171',battery:'#a78bfa',
}

// Find the single peak cell per month for current metric+grids
function findMonthPeaks(grids,metric,cols,rows,granularity,yearType){
  const grid=grids?.[metric];if(!grid)return[]
  const MONTH_STARTS=yearType==='FY'?[0,31,62,92,123,153,184,215,243,274,304,335]
                                    :[0,31,59,90,120,151,181,212,243,273,304,334]
  const peaks=[]
  const xStarts=granularity==='daily'||granularity==='weekly'
    ?MONTH_STARTS.map(d=>Math.floor(d/7)):MONTH_STARTS
  for(let mi=0;mi<12;mi++){
    const x0=xStarts[mi],x1=mi<11?xStarts[mi+1]:cols
    let bestVal=-Infinity,bestC=-1,bestR=-1
    for(let c=x0;c<Math.min(x1,cols);c++)for(let r=0;r<rows;r++){
      const v=grid[c*rows+r];if(v>bestVal){bestVal=v;bestC=c;bestR=r}
    }
    if(bestC>=0)peaks.push({c:bestC,r:bestR,val:bestVal,month:mi})
  }
  return peaks
}

// Draw a sprite centered on canvas coords (cx,cy), scaled so sprite fits in spriteW×spriteH px
function drawSprite(ctx,sprite,cx,cy,spriteW,spriteH,color,alpha){
  const rows=sprite.length,cols2=sprite[0].length
  const pw=spriteW/cols2,ph=spriteH/rows
  ctx.save()
  ctx.globalAlpha=alpha
  // Glow
  ctx.shadowColor=color;ctx.shadowBlur=spriteW*0.35
  ctx.fillStyle=color
  for(let r=0;r<rows;r++)for(let c=0;c<cols2;c++){
    if(sprite[r][c]!=='1')continue
    ctx.fillRect(cx-spriteW/2+c*pw,cy-spriteH/2+r*ph,Math.ceil(pw),Math.ceil(ph))
  }
  ctx.restore()
}const DOT_COLOR_DARK={renewables:'#4ade80',solar:'#fbbf24',wind:'#38bdf8',gas:'#fb923c',coal:'#a8a29e',carbon:'#f87171',battery:'#818cf8'}
const DOT_COLOR_LIGHT={renewables:'#16a34a',solar:'#d97706',wind:'#0284c7',gas:'#ea580c',coal:'#57534e',carbon:'#dc2626',battery:'#4338ca'}

// ── NEM Facility data ─────────────────────────────────────────────────────────
const FACILITIES=[
  {code:'ROOFTOP_NSW',name:'Rooftop Solar NSW',region:'NSW1',fueltech:'solar_rooftop',mw:7500},
  {code:'ROOFTOP_QLD',name:'Rooftop Solar QLD',region:'QLD1',fueltech:'solar_rooftop',mw:6200},
  {code:'ROOFTOP_VIC',name:'Rooftop Solar VIC',region:'VIC1',fueltech:'solar_rooftop',mw:5100},
  {code:'ERARING',name:'Eraring',region:'NSW1',fueltech:'coal',mw:2880},
  {code:'BAYSW',name:'Bayswater',region:'NSW1',fueltech:'coal',mw:2640},
  {code:'ROOFTOP_SA',name:'Rooftop Solar SA',region:'SA1',fueltech:'solar_rooftop',mw:2600},
  {code:'LOYYANGA',name:'Loy Yang A',region:'VIC1',fueltech:'coal',mw:2210},
  {code:'SNOWY1',name:'Tumut 3',region:'NSW1',fueltech:'hydro',mw:2100},
  {code:'LIDDELL',name:'Liddell',region:'NSW1',fueltech:'coal',mw:2000},
  {code:'G/STONE',name:'Gladstone',region:'QLD1',fueltech:'coal',mw:1680},
  {code:'MURRAY',name:'Murray',region:'VIC1',fueltech:'hydro',mw:1500},
  {code:'YALLOURN',name:'Yallourn W',region:'VIC1',fueltech:'coal',mw:1480},
  {code:'STANWELL',name:'Stanwell',region:'QLD1',fueltech:'coal',mw:1460},
  {code:'MP',name:'Mt Piper',region:'NSW1',fueltech:'coal',mw:1400},
  {code:'TARONG',name:'Tarong',region:'QLD1',fueltech:'coal',mw:1400},
  {code:'VP',name:'Vales Point B',region:'NSW1',fueltech:'coal',mw:1320},
  {code:'TORRIS',name:'Torrens Island',region:'SA1',fueltech:'gas',mw:1280},
  {code:'WIVENHOE',name:'Wivenhoe',region:'QLD1',fueltech:'hydro',mw:1050},
  {code:'LOYYB',name:'Loy Yang B',region:'VIC1',fueltech:'coal',mw:1000},
  {code:'MILLMERN',name:'Millmerran',region:'QLD1',fueltech:'coal',mw:852},
  {code:'WARATAH',name:'Waratah Super Battery',region:'NSW1',fueltech:'battery',mw:850},
  {code:'CALLIDEC1',name:'Callide C',region:'QLD1',fueltech:'coal',mw:840},
  {code:'KOGANCK',name:'Kogan Creek',region:'QLD1',fueltech:'coal',mw:744},
  {code:'COLONGRA',name:'Colongra',region:'NSW1',fueltech:'gas',mw:724},
  {code:'CALL_B',name:'Callide B',region:'QLD1',fueltech:'coal',mw:700},
  {code:'URANQ',name:'Uranquinty',region:'NSW1',fueltech:'gas',mw:664},
  {code:'DDPS1',name:'Darling Downs',region:'QLD1',fueltech:'gas',mw:643},
  {code:'SNOWY2',name:'Tumut 1+2',region:'NSW1',fueltech:'hydro',mw:616},
  {code:'MORTLK',name:'Mortlake',region:'VIC1',fueltech:'gas',mw:566},
  {code:'B2PS',name:'Braemar 2',region:'QLD1',fueltech:'gas',mw:519},
  {code:'BRAEMARA',name:'Braemar',region:'QLD1',fueltech:'gas',mw:504},
  {code:'NEWPORT',name:'Newport',region:'VIC1',fueltech:'gas',mw:500},
  {code:'ROOFTOP_TAS',name:'Rooftop Solar TAS',region:'TAS1',fueltech:'solar_rooftop',mw:500},
  {code:'SHOALHAV',name:'Shoalhaven',region:'NSW1',fueltech:'hydro',mw:480},
  {code:'SNOWY3',name:'Snowy Hydro',region:'NSW1',fueltech:'hydro',mw:480},
  {code:'NPPPPS',name:'Pelican Point',region:'SA1',fueltech:'gas',mw:478},
  {code:'GORDON1',name:'Gordon',region:'TAS1',fueltech:'hydro',mw:457},
  {code:'COOPGWF',name:'Coopers Gap',region:'QLD1',fueltech:'wind',mw:452},
  {code:'TARONGN',name:'Tarong North',region:'QLD1',fueltech:'coal',mw:443},
  {code:'JEERALANG',name:'Jeeralang',region:'VIC1',fueltech:'gas',mw:428},
  {code:'GORDON2',name:'Gordon Hydro',region:'TAS1',fueltech:'hydro',mw:424},
  {code:'MACARTHUR',name:'Macarthur',region:'VIC1',fueltech:'wind',mw:420},
  {code:'STOCKYARD',name:'Stockyard Hill',region:'VIC1',fueltech:'wind',mw:400},
  {code:'WSTRNDWN',name:'Western Downs Green',region:'QLD1',fueltech:'solar_utility',mw:400},
  {code:'GPWFWEST',name:'Golden Plains West',region:'VIC1',fueltech:'wind',mw:396},
  {code:'SWANBANK',name:'Swanbank E',region:'QLD1',fueltech:'gas',mw:385},
  {code:'MOORABOOL',name:'Moorabool',region:'VIC1',fueltech:'wind',mw:348},
  {code:'TUMUT1',name:'Tumut 1',region:'NSW1',fueltech:'hydro',mw:320},
  {code:'TALLWRRA',name:'Tallawarra B',region:'NSW1',fueltech:'gas',mw:316},
  {code:'VICTBIGBAT',name:'Victorian Big Battery',region:'VIC1',fueltech:'battery',mw:300},
  {code:'POATINA',name:'Poatina',region:'TAS1',fueltech:'hydro',mw:300},
  {code:'TUMUT2',name:'Tumut 2',region:'NSW1',fueltech:'hydro',mw:286},
  {code:'OAKEY_GAS',name:'Oakey',region:'QLD1',fueltech:'gas',mw:282},
  {code:'LAKEBONNEY',name:'Lake Bonney',region:'SA1',fueltech:'wind',mw:279},
  {code:'DARLINGTON',name:'Darlington Point',region:'NSW1',fueltech:'solar_utility',mw:275},
  {code:'SAPPHIRE',name:'Sapphire',region:'NSW1',fueltech:'wind',mw:270},
  {code:'SNOWTOWN2',name:'Snowtown 2',region:'SA1',fueltech:'wind',mw:270},
  {code:'SUNRAYSIA',name:'Sunraysia',region:'VIC1',fueltech:'solar_utility',mw:255},
  {code:'TORRBESS',name:'Torrens Island BESS',region:'SA1',fueltech:'battery',mw:250},
  {code:'LIMONDALE',name:'Limondale',region:'NSW1',fueltech:'solar_utility',mw:249},
  {code:'GPWFEAST',name:'Golden Plains East',region:'VIC1',fueltech:'wind',mw:248},
  {code:'ARARAT',name:'Ararat',region:'VIC1',fueltech:'wind',mw:240},
  {code:'BUNGALA',name:'Bungala',region:'SA1',fueltech:'solar_utility',mw:220},
  {code:'HAMILTONS',name:'Hamilton Solar',region:'VIC1',fueltech:'solar_utility',mw:220},
  {code:'QUARANTINE',name:'Quarantine PS',region:'SA1',fueltech:'gas',mw:220},
  {code:'AGLHAL',name:'Hallett GT',region:'SA1',fueltech:'gas',mw:217},
  {code:'TAILEMBEND2',name:'Tailem Bend 2',region:'SA1',fueltech:'solar_utility',mw:212},
  {code:'TAMAR',name:'Tamar Valley',region:'TAS1',fueltech:'gas',mw:208},
  {code:'BULGANA',name:'Bulgana',region:'VIC1',fueltech:'wind',mw:204},
  {code:'WAUBRA',name:'Waubra',region:'VIC1',fueltech:'wind',mw:192},
  {code:'DARTMOUTH',name:'Dartmouth',region:'VIC1',fueltech:'hydro',mw:185},
  {code:'DULACCA',name:'Dulacca',region:'QLD1',fueltech:'wind',mw:180},
  {code:'OSBORNE',name:'Osborne',region:'SA1',fueltech:'gas',mw:180},
  {code:'MUSSELROE',name:'Musselroe',region:'TAS1',fueltech:'wind',mw:168},
  {code:'SOMERTON',name:'Somerton',region:'VIC1',fueltech:'gas',mw:160},
  {code:'CALLISTA',name:'Callista',region:'QLD1',fueltech:'wind',mw:157},
  {code:'REECE',name:'Reece',region:'TAS1',fueltech:'hydro',mw:156},
  {code:'HORNSDAL',name:'Hornsdale Power Reserve',region:'SA1',fueltech:'battery',mw:150},
  {code:'CLERMONT',name:'Clermont',region:'QLD1',fueltech:'solar_utility',mw:150},
  {code:'JOHN_BUTTS',name:'John Butters',region:'TAS1',fueltech:'hydro',mw:144},
  {code:'WEMEN',name:'Wemen',region:'VIC1',fueltech:'solar_utility',mw:143},
  {code:'WOOLNORTH',name:'Woolnorth',region:'TAS1',fueltech:'wind',mw:140},
  {code:'CONDAMINE',name:'Condamine',region:'QLD1',fueltech:'gas',mw:140},
  {code:'CRUDINE',name:'Crudine Ridge',region:'NSW1',fueltech:'wind',mw:135},
  {code:'FINLEY',name:'Finley',region:'NSW1',fueltech:'solar_utility',mw:132},
  {code:'EILDON',name:'Eildon',region:'VIC1',fueltech:'hydro',mw:120},
  {code:'KAROSF',name:'Karadoc SF',region:'SA1',fueltech:'solar_utility',mw:117},
  {code:'MINTARO',name:'Mintaro',region:'SA1',fueltech:'gas',mw:115},
  {code:'BOCO_ROCK',name:'Boco Rock',region:'NSW1',fueltech:'wind',mw:113},
  {code:'COLLECTOR',name:'Collector',region:'NSW1',fueltech:'wind',mw:113},
  {code:'HORNSDALE3',name:'Hornsdale 3',region:'SA1',fueltech:'wind',mw:112},
  {code:'WATERLOO',name:'Waterloo',region:'SA1',fueltech:'wind',mw:111},
  {code:'GRANHARBOUR',name:'Granville Harbour',region:'TAS1',fueltech:'wind',mw:111},
  {code:'BANNERTON',name:'Bannerton',region:'VIC1',fueltech:'solar_utility',mw:110},
  {code:'CLARESF',name:'Clare',region:'QLD1',fueltech:'solar_utility',mw:110},
  {code:'TBSF',name:'Tailem Bend 1',region:'SA1',fueltech:'solar_utility',mw:108},
  {code:'TRIBUTE',name:'Tribute',region:'TAS1',fueltech:'hydro',mw:108},
  {code:'TARALGA',name:'Taralga',region:'NSW1',fueltech:'wind',mw:106},
  {code:'MCKAY',name:'Bogong Mackay',region:'VIC1',fueltech:'hydro',mw:106},
  {code:'KARSF',name:'Karadoc',region:'VIC1',fueltech:'solar_utility',mw:104},
  {code:'HORNWF',name:'Hornsdale Wind',region:'SA1',fueltech:'wind',mw:102},
  {code:'WANDOAN',name:'Wandoan South',region:'QLD1',fueltech:'battery',mw:100},
  {code:'CAPSBESS',name:'Capricornia BESS',region:'QLD1',fueltech:'battery',mw:100},
  {code:'SNOWTOWN1',name:'Snowtown 1',region:'SA1',fueltech:'wind',mw:99},
  {code:'HALLETT',name:'Hallett',region:'SA1',fueltech:'wind',mw:95},
  {code:'TREVALLYN',name:'Trevallyn',region:'TAS1',fueltech:'hydro',mw:93},
  {code:'EMERASF',name:'Emerald',region:'QLD1',fueltech:'solar_utility',mw:88},
  {code:'GOONSF',name:'Goonumbla',region:'NSW1',fueltech:'solar_utility',mw:85},
  {code:'SRSF',name:'Susan River',region:'QLD1',fueltech:'solar_utility',mw:85},
  {code:'CETHANA',name:'Cethana',region:'TAS1',fueltech:'hydro',mw:85},
  {code:'LIAPOOTAH',name:'Liapootah',region:'TAS1',fueltech:'hydro',mw:84},
  {code:'ELAINEWF',name:'Elaine',region:'VIC1',fueltech:'wind',mw:83},
  {code:'RUGBYR',name:'Rugby Run',region:'QLD1',fueltech:'solar_utility',mw:83},
  {code:'LEM_WIL',name:'Lemonthyme Wilmot',region:'TAS1',fueltech:'hydro',mw:82},
  {code:'LKBONNY1',name:'Lake Bonney 1',region:'SA1',fueltech:'wind',mw:81},
  {code:'BASTYAN',name:'Bastyan',region:'TAS1',fueltech:'hydro',mw:80},
  {code:'LADBROKE',name:'Ladbroke Grove',region:'SA1',fueltech:'gas',mw:80},
  {code:'ROMA',name:'Roma',region:'QLD1',fueltech:'gas',mw:80},
  {code:'MACKNTSH',name:'Mackintosh',region:'TAS1',fueltech:'hydro',mw:80},
  {code:'BLOWERING',name:'Blowering',region:'NSW1',fueltech:'hydro',mw:80},
  {code:'CROWLANDS',name:'Crowlands',region:'VIC1',fueltech:'wind',mw:79},
  {code:'DAYDSF',name:'Daydream',region:'QLD1',fueltech:'solar_utility',mw:79},
  {code:'NUMURKSF',name:'Numurkah',region:'VIC1',fueltech:'solar_utility',mw:74},
  {code:'HALLWF2',name:'Hallett 2',region:'SA1',fueltech:'wind',mw:71},
  {code:'MTMILLAR',name:'Mt Millar',region:'SA1',fueltech:'wind',mw:70},
  {code:'PIONEER',name:'Pioneer Sugar Mill',region:'QLD1',fueltech:'biomass',mw:68},
  {code:'OAKLANDS',name:'Oaklands Hill',region:'VIC1',fueltech:'wind',mw:67},
  {code:'CATHROCK',name:'Cathedral Rocks',region:'SA1',fueltech:'wind',mw:66},
  {code:'OAKEY2SF',name:'Oakey 2',region:'QLD1',fueltech:'solar_utility',mw:65},
  {code:'CHILDSF',name:'Childers',region:'QLD1',fueltech:'solar_utility',mw:64},
  {code:'MEADOWBK',name:'Meadowbank',region:'TAS1',fueltech:'hydro',mw:64},
  {code:'MBAHNTH',name:'Moranbah North',region:'QLD1',fueltech:'gas',mw:63},
  {code:'WKIEWA',name:'West Kiewa',region:'VIC1',fueltech:'hydro',mw:62},
  {code:'BALBESS',name:'Ballarat Battery',region:'VIC1',fueltech:'battery',mw:60},
  {code:'DALNTH',name:'Dalrymple North',region:'SA1',fueltech:'battery',mw:60},
  {code:'GANNBESS',name:'Gannawarra',region:'VIC1',fueltech:'battery',mw:60},
  {code:'BARRON',name:'Barron Gorge',region:'QLD1',fueltech:'hydro',mw:60},
  {code:'DEVILS_G',name:'Devils Gate',region:'TAS1',fueltech:'hydro',mw:60},
  {code:'CHALLICUM',name:'Challicum Hills',region:'VIC1',fueltech:'wind',mw:52},
  {code:'KSP1',name:'Kidston',region:'QLD1',fueltech:'solar_utility',mw:50},
  {code:'LBBESS',name:'Lake Bonney BESS',region:'SA1',fueltech:'battery',mw:50},
  {code:'INVICTA',name:'Invicta Sugar Mill',region:'QLD1',fueltech:'biomass',mw:50},
  {code:'RACOMIL',name:'Racecourse Mill',region:'QLD1',fueltech:'biomass',mw:49},
  {code:'WOODLAWN',name:'Woodlawn',region:'NSW1',fueltech:'wind',mw:48},
  {code:'GUNNING',name:'Gunning',region:'NSW1',fueltech:'wind',mw:47},
  {code:'CANUNDA',name:'Canunda',region:'SA1',fueltech:'wind',mw:46},
  {code:'GERMCRK',name:'German Creek',region:'QLD1',fueltech:'gas',mw:45},
  {code:'LONGFORD',name:'Longford',region:'VIC1',fueltech:'gas',mw:44},
  {code:'FISHER',name:'Fisher',region:'TAS1',fueltech:'hydro',mw:43},
  {code:'CSPVPS',name:'Collinsville',region:'QLD1',fueltech:'solar_utility',mw:42},
  {code:'SITHE',name:'Smithfield',region:'NSW1',fueltech:'gas',mw:39},
  {code:'LKBONNY3',name:'Lake Bonney 3',region:'SA1',fueltech:'wind',mw:39},
  {code:'WARWSF1',name:'Warwick SF 1',region:'QLD1',fueltech:'solar_utility',mw:39},
  {code:'WARWSF2',name:'Warwick SF 2',region:'QLD1',fueltech:'solar_utility',mw:39},
  {code:'LIMOSF2',name:'Limondale 2',region:'NSW1',fueltech:'solar_utility',mw:38},
  {code:'BWTR1',name:'Broadwater',region:'NSW1',fueltech:'biomass',mw:38},
  {code:'BARCALDN',name:'Barcaldine',region:'QLD1',fueltech:'gas',mw:37},
  {code:'MOLNGSF',name:'Molong',region:'NSW1',fueltech:'solar_utility',mw:36},
  {code:'STARFISH',name:'Starfish Hill',region:'SA1',fueltech:'wind',mw:35},
  {code:'DAANDINE',name:'Daandine',region:'QLD1',fueltech:'gas',mw:33},
  {code:'MARYRSF',name:'Maryborough',region:'QLD1',fueltech:'solar_utility',mw:33},
  {code:'YAMBUK',name:'Yambuk',region:'VIC1',fueltech:'wind',mw:30},
  {code:'MIDDLESF',name:'Middlemount',region:'QLD1',fueltech:'solar_utility',mw:30},
  {code:'OAKEY1SF',name:'Oakey 1',region:'QLD1',fueltech:'solar_utility',mw:30},
  {code:'CONDONG',name:'Condong',region:'NSW1',fueltech:'biomass',mw:30},
  {code:'RPCG',name:'Rocky Point',region:'QLD1',fueltech:'biomass',mw:30},
  {code:'HUMENSW',name:'Hume NSW',region:'NSW1',fueltech:'hydro',mw:29},
  {code:'HUMEV',name:'Hume VIC',region:'VIC1',fueltech:'hydro',mw:29},
  {code:'CLOVER',name:'Clover',region:'VIC1',fueltech:'hydro',mw:29},
  {code:'YSWF',name:'Yaloak South',region:'VIC1',fueltech:'wind',mw:28},
  {code:'REPULSE',name:'Repulse',region:'TAS1',fueltech:'hydro',mw:28},
  {code:'GRIFSF',name:'Griffith',region:'NSW1',fueltech:'solar_utility',mw:27},
  {code:'BURRIN',name:'Burrinjuck',region:'NSW1',fueltech:'hydro',mw:27},
  {code:'MANSLR',name:'Manildra',region:'NSW1',fueltech:'solar_utility',mw:25},
  {code:'ICSM',name:'Isis Central Sugar Mill',region:'QLD1',fueltech:'biomass',mw:25},
  {code:'GORDONVALE',name:'Gordonvale',region:'QLD1',fueltech:'biomass',mw:24},
  {code:'TABMILL2',name:'Tableland Mill',region:'QLD1',fueltech:'biomass',mw:24},
  {code:'VICMILL',name:'Victoria Mill',region:'QLD1',fueltech:'biomass',mw:24},
  {code:'COPTNHYD',name:'Copeton',region:'NSW1',fueltech:'hydro',mw:23},
  {code:'WRSF1',name:'White Rock',region:'NSW1',fueltech:'solar_utility',mw:22},
  {code:'TOORAWF',name:'Toora',region:'VIC1',fueltech:'wind',mw:21},
  {code:'MLWF',name:'Mortons Lane',region:'VIC1',fueltech:'wind',mw:20},
  {code:'CBWF',name:'Coonoer Bridge',region:'VIC1',fueltech:'wind',mw:20},
  {code:'ROYALLA',name:'Royalla',region:'NSW1',fueltech:'solar_utility',mw:20},
  {code:'WYANGALA',name:'Wyangala A',region:'NSW1',fueltech:'hydro',mw:20},
  {code:'CODRINGTON',name:'Codrington',region:'VIC1',fueltech:'wind',mw:18},
]
const FUELTECH_COLOR={coal:'#94a3b8',gas:'#fb923c',wind:'#818cf8',solar_utility:'#fde047',solar_rooftop:'#fbbf24',hydro:'#38bdf8',battery:'#e879f9',biomass:'#86efac'}
const FUELTECH_LABEL={coal:'Coal',gas:'Gas',wind:'Wind',solar_utility:'Solar',solar_rooftop:'Rooftop Solar',hydro:'Hydro',battery:'Battery',biomass:'Biomass'}

// ── Squarified treemap layout ─────────────────────────────────────────────────
function squarify(items,x,y,w,h){
  if(!items.length||w<1||h<1)return[]
  const sorted=[...items].sort((a,b)=>b.value-a.value)
  const out=[]
  _sq(sorted,x,y,w,h,sorted.reduce((s,i)=>s+i.value,0),out)
  return out
}
function _sq(items,x,y,w,h,total,out){
  if(!items.length||w<0.5||h<0.5)return
  if(items.length===1){out.push({...items[0],x,y,w,h});return}
  const horiz=w>=h,side=horiz?h:w,scale=(w*h)/total
  let row=[],rowSum=0,best=Infinity
  for(let i=0;i<items.length;i++){
    const v=items[i].value*scale
    const nr=[...row,v],ns=rowSum+v,tk=ns/side
    const worst=nr.reduce((m,vi)=>{const l=vi/ns*side;return Math.max(m,tk/l,l/tk)},0)
    if(worst<best){row=nr;rowSum=ns;best=worst}else break
  }
  const thick=rowSum/side
  let pos=horiz?y:x
  row.forEach((v,i)=>{
    const len=(v/rowSum)*side
    out.push({...items[i],...(horiz?{x,y:pos,w:thick,h:len}:{x:pos,y,w:len,h:thick})})
    pos+=len
  })
  const rest=items.slice(row.length);if(!rest.length)return
  const rt=rest.reduce((s,i)=>s+i.value,0)
  if(horiz)_sq(rest,x+thick,y,w-thick,h,rt,out)
  else _sq(rest,x,y+thick,w,h-thick,rt,out)
}

// ── Pixel palettes — 8 flat colours per metric, dark + light variants ─────────
// Each entry: [maxValueInclusive, hexColor]
const PIXEL_PALETTES_DARK={
  renewables:[
    [10, '#0d1117'],[20,'#0f2318'],[32,'#1a3d20'],[45,'#1e6b2a'],
    [58,'#22882f'],[72,'#28b83e'],[86,'#3dd668'],[100,'#86efac'],
  ],
  solar:[
    [5, '#0d0e10'],[12,'#2a1e04'],[22,'#6b3d08'],[34,'#a85c0a'],
    [46,'#d48012'],[60,'#f0b020'],[76,'#f8d048'],[100,'#fff08c'],
  ],
  wind:[
    [5, '#0d0e10'],[12,'#051828'],[22,'#093660'],[34,'#0b5c8a'],
    [46,'#0e8aaa'],[60,'#12b8c8'],[76,'#30d4e0'],[100,'#88eef4'],
  ],
  gas:[
    [5, '#0d0e10'],[12,'#200e04'],[22,'#5a2208'],[34,'#9a4210'],
    [46,'#d06418'],[60,'#e89030'],[76,'#f0b060'],[100,'#f8d0a0'],
  ],
  coal:[
    [5, '#0d0e10'],[12,'#1a1816'],[22,'#38332e'],[34,'#5c5550'],
    [46,'#807874'],[60,'#a8a09a'],[76,'#c8c2bc'],[100,'#e0dbd6'],
  ],
  carbon:[
    [100,'#2ee87a'],[200,'#58d668'],[300,'#f0e040'],[400,'#f0b820'],
    [500,'#e87820'],[600,'#d83018'],[700,'#a81010'],[800,'#6e0808'],
  ],
  battery:[
    [1, '#0d0e10'],[2,'#080c28'],[4,'#0c1860'],[6,'#1030a8'],
    [8,'#2850d0'],[10,'#4878e8'],[13,'#80a8f8'],[15,'#b4ccff'],
  ],
}
const PIXEL_PALETTES_LIGHT={
  renewables:[
    [10,'#eef5f0'],[20,'#c8e8cc'],[32,'#90d0a0'],[45,'#52b870'],
    [58,'#2a9e58'],[72,'#187e40'],[86,'#0e5e2c'],[100,'#084020'],
  ],
  solar:[
    [5,'#fffdf0'],[12,'#fff0c0'],[22,'#ffd870'],[34,'#f0b820'],
    [46,'#d89010'],[60,'#b86808'],[76,'#904804'],[100,'#682800'],
  ],
  wind:[
    [5,'#f0f8ff'],[12,'#c8e8f8'],[22,'#88c8f0'],[34,'#3898d8'],
    [46,'#1070b8'],[60,'#0850a0'],[76,'#043880'],[100,'#022060'],
  ],
  gas:[
    [5,'#fff8f0'],[12,'#ffe8c8'],[22,'#ffc888'],[34,'#f09840'],
    [46,'#d06818'],[60,'#b04808'],[76,'#882804'],[100,'#601002'],
  ],
  coal:[
    [5,'#f8f7f6'],[12,'#e8e4e0'],[22,'#d0cac4'],[34,'#b0a89e'],
    [46,'#908880'],[60,'#706860'],[76,'#504840'],[100,'#302820'],
  ],
  carbon:[
    [100,'#0e6030'],[200,'#2e9850'],[300,'#d8c020'],[400,'#e89010'],
    [500,'#d85808'],[600,'#c02808'],[700,'#900808'],[800,'#580404'],
  ],
  battery:[
    [1,'#f0f2ff'],[2,'#d0d8f8'],[4,'#a0b0f0'],[6,'#6080e0'],
    [8,'#3858c8'],[10,'#2040a8'],[13,'#102880'],[15,'#081058'],
  ],
}
function pixelColor(metric,val,dark){
  const pal=dark?PIXEL_PALETTES_DARK[metric]:PIXEL_PALETTES_LIGHT[metric]
  for(const[thresh,color]of pal)if(val<=thresh)return color
  return pal[pal.length-1][1]
}
const PROFILES={
  NEM: {solar:0.26,solarS:0.10,wind:0.14,windW:0.06,hydro:0.10,gas:0.18,coal:0.28},
  NSW1:{solar:0.24,solarS:0.09,wind:0.11,windW:0.05,hydro:0.08,gas:0.16,coal:0.32},
  VIC1:{solar:0.18,solarS:0.07,wind:0.24,windW:0.09,hydro:0.04,gas:0.20,coal:0.28},
  QLD1:{solar:0.34,solarS:0.12,wind:0.07,windW:0.03,hydro:0.03,gas:0.22,coal:0.30},
  SA1: {solar:0.28,solarS:0.10,wind:0.38,windW:0.12,hydro:0.01,gas:0.24,coal:0.03},
  TAS1:{solar:0.05,solarS:0.03,wind:0.14,windW:0.07,hydro:0.62,gas:0.08,coal:0.02},
}
const RAW_DAYS=365,RAW_SLOTS=48
function generateSimData(region,maxDay=365,maxSlot=48,year=2024){
  const p=PROFILES[region]
  let s=region.split('').reduce((a,c)=>a*31+c.charCodeAt(0),42)>>>0
  // Mix year into seed so each year is visually distinct
  s=(s^(year*2654435761))>>>0
  s=(s^(s>>>16))*0x45d9f3b>>>0
  s=(s^(s>>>16))>>>0
  const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/0xffffffff}
  const randn=()=>Math.sqrt(-2*Math.log(rand()+1e-9))*Math.cos(2*Math.PI*rand())
  const ws=new Float32Array(RAW_DAYS*RAW_SLOTS);let w=0
  for(let i=0;i<ws.length;i++){w=0.97*w+0.06*randn();ws[i]=w}
  let mn=Infinity,mx=-Infinity;for(const v of ws){if(v<mn)mn=v;if(v>mx)mx=v}
  const wr=mx-mn;for(let i=0;i<ws.length;i++)ws[i]=(ws[i]-mn)/wr
  const grids={
    renewables:new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1),
    solar:new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1),
    wind:new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1),
    gas:new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1),
    coal:new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1),
    carbon:new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1),
    battery:new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1),
  }
  // Battery capacity factor — scales with region's renewable penetration
  const batCap=Math.min(0.12,(p.solar+p.wind)*0.18)
  let soc=0.4 // state of charge 0-1
  for(let day=0;day<RAW_DAYS;day++){
    if(day>maxDay)continue
    const sp=Math.cos(2*Math.PI*(day-15)/365)
    for(let slot=0;slot<RAW_SLOTS;slot++){
      if(day===maxDay&&slot>=maxSlot)continue
      const hour=slot/2,idx=day*RAW_SLOTS+slot
      const sw=3.0+sp*0.9,sc=Math.exp(-0.5*((hour-12.5)/sw)**2)
      const sa=Math.max(0,p.solar+p.solarS*sp)
      const solar=Math.max(0,sc*sa*(0.82+0.18*(1-rand()*0.25)))
      const wa=p.wind+p.windW*(-sp)
      const wind=Math.max(0,ws[idx]*wa*1.6+wa*0.15)
      const hydro=Math.max(0,p.hydro*(0.85+0.3*rand()))
      const gas=Math.max(0,p.gas*(1-sc*0.5)*(1-sp*0.1)*(0.8+0.4*rand()))
      const coal=Math.max(0,p.coal*(1-sc*0.3)*(1+sp*0.05)*(0.85+0.3*rand()))
      const ren=Math.min(100,Math.round((solar+wind+hydro)*1000)/10)
      grids.renewables[idx]=ren
      grids.solar[idx]=Math.min(100,Math.round(solar*1000)/10)
      grids.wind[idx]=Math.min(100,Math.round(wind*1000)/10)
      grids.gas[idx]=Math.min(100,Math.round(gas*1000)/10)
      grids.coal[idx]=Math.min(100,Math.round(coal*1000)/10)
      grids.carbon[idx]=Math.round(Math.max(15,(1-ren/100)*750))

      // Battery: charges midday when solar surplus, discharges evening 17-21h
      const isMorning=hour>=7&&hour<11
      const isSolarPeak=hour>=10&&hour<15
      const isEvening=hour>=17&&hour<21
      const chargeRate=isSolarPeak?Math.max(0,(solar-0.15)*0.6):0
      const dischargeRate=isEvening?0.04*(0.8+0.4*rand()):isMorning?0.01:0
      soc=Math.max(0,Math.min(1,soc+chargeRate*0.5/48-dischargeRate/48))
      // Battery dispatch = proportion of load served from battery when discharging
      const batOut=isEvening?Math.min(soc*batCap*100,batCap*100*(0.6+0.4*rand())):
                   isMorning?Math.min(soc*batCap*30,batCap*30*(rand())):0
      grids.battery[idx]=Math.min(100,Math.round(batOut*10)/10)
    }
  }
  return grids
}

// ── Financial year ────────────────────────────────────────────────────────────
const FY_START_DAY=181
function buildFYGrids(prevRaw,curRaw){
  const out={}
  for(const m of Object.keys(prevRaw)){
    const a=prevRaw[m],b=curRaw[m]
    const dst=new Float32Array(RAW_DAYS*RAW_SLOTS).fill(-1)
    let dstDay=0
    for(let d=FY_START_DAY;d<RAW_DAYS;d++){for(let s=0;s<RAW_SLOTS;s++)dst[dstDay*RAW_SLOTS+s]=a[d*RAW_SLOTS+s];dstDay++}
    for(let d=0;d<FY_START_DAY;d++){for(let s=0;s<RAW_SLOTS;s++)dst[dstDay*RAW_SLOTS+s]=b[d*RAW_SLOTS+s];dstDay++}
    out[m]=dst
  }
  return out
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function aggregateGrids(rawGrids,granularity,year){
  if(!rawGrids)return{grids:null,cols:RAW_DAYS,rows:RAW_SLOTS,startDow:0}
  const metrics=Object.keys(rawGrids)
  if(granularity==='30min')return{grids:rawGrids,cols:RAW_DAYS,rows:RAW_SLOTS,startDow:0}
  if(granularity==='hourly'){
    const cols=RAW_DAYS,rows=24,out={}
    for(const m of metrics){
      const src=rawGrids[m],dst=new Float32Array(cols*rows).fill(-1)
      for(let d=0;d<RAW_DAYS;d++)for(let h=0;h<24;h++){
        const a=src[d*RAW_SLOTS+h*2],b=src[d*RAW_SLOTS+h*2+1]
        dst[d*rows+h]=(a>=0&&b>=0)?(a+b)/2:(a>=0?a:(b>=0?b:-1))
      }
      out[m]=dst
    }
    return{grids:out,cols,rows,startDow:0}
  }
  if(granularity==='daily'){
    const cols=52,rows=7,out={}
    const adjStartDow=(new Date(year,0,1).getDay()+6)%7
    for(const m of metrics){
      const src=rawGrids[m],dst=new Float32Array(cols*rows).fill(-1)
      for(let day=0;day<RAW_DAYS;day++){
        const wi=Math.floor((day+adjStartDow)/7),dow=(day+adjStartDow)%7
        if(wi>=cols)continue
        let sum=0,cnt=0
        for(let s=0;s<RAW_SLOTS;s++){const v=src[day*RAW_SLOTS+s];if(v>=0){sum+=v;cnt++}}
        dst[wi*rows+dow]=cnt?sum/cnt:-1
      }
      out[m]=dst
    }
    return{grids:out,cols,rows,startDow:adjStartDow}
  }
  // weekly
  const cols=52,rows=1,out={}
  for(const m of metrics){
    const src=rawGrids[m],dst=new Float32Array(cols*rows).fill(-1)
    for(let wk=0;wk<cols;wk++){
      let sum=0,cnt=0
      for(let d=wk*7;d<Math.min((wk+1)*7,RAW_DAYS);d++)
        for(let s=0;s<RAW_SLOTS;s++){const v=src[d*RAW_SLOTS+s];if(v>=0){sum+=v;cnt++}}
      dst[wk]=cnt?sum/cnt:-1
    }
    out[m]=dst
  }
  return{grids:out,cols,rows,startDow:0}
}

// ── Themes ────────────────────────────────────────────────────────────────────
const themes={
  dark: {bg:'#0c0d0f',surface:'#141618',border:'#242729',text:'#e8e9ea',muted:'#5a5f66',canvas:'#0c0d0f',canvasBg:'#111315',tick:'#242729',tickLabel:'#5a5f66',tooltip:{bg:'#141618',border:'#242729',text:'#e8e9ea'}},
  light:{bg:'#f7f5f0',surface:'#eeece7',border:'#ddd9d0',text:'#1a1a18',muted:'#8a8880',canvas:'#f7f5f0',canvasBg:'#eeece7',tick:'#111111',tickLabel:'#8a8880',tooltip:{bg:'#fff',border:'#ddd9d0',text:'#1a1a18'}},
}

// ── Layout constants ──────────────────────────────────────────────────────────
const CY_MONTH_STARTS=[0,31,59,90,120,151,181,212,243,273,304,334]
const CY_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FY_MONTH_STARTS=[0,31,62,92,123,153,184,215,243,274,304,335]
const FY_MONTHS=['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun']
const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const PAD={top:8,right:52,bottom:64,left:46}
const TRAIL_DURATION=750
const TRAIL_MAX=80

// ── NOW ───────────────────────────────────────────────────────────────────────
const NOW=(()=>{
  const n=new Date(),s=new Date(n.getFullYear(),0,1)
  const doy=Math.floor((n-s)/86400000)
  const slot=n.getHours()*2+Math.floor(n.getMinutes()/30)
  return{year:n.getFullYear(),month:n.getMonth()+1,day:n.getDate(),doy,slot}
})()

// ── Heatmap ───────────────────────────────────────────────────────────────────
function Heatmap({rawGrids,metric,year,theme:t,dark,dotMode,goo,pixelMode,watermarkMode,numBands,onNumBandsChange,spritesMode,granularity,yearType}){
  const containerRef=useRef(null)
  const canvasRef=useRef(null)       // full canvas: bg + axes + labels + legend + rect/dot cells
  const gooCanvasRef=useRef(null)    // small canvas (plot-area only) inside filtered div, for goo
  const trailCanvasRef=useRef(null)
  const textCanvasRef=useRef(null)   // pixel-text intro animation
  const spritesCanvasRef=useRef(null) // mascot sprite overlays
  const tooltipRef=useRef(null)
  const textAnimRef=useRef(null)     // {cells, color, startTime}
  const textRafRef=useRef(null)
  const[size,setSize]=useState({w:0,h:0})
  const[lastCell,setLastCell]=useState(null)
  const[hoverCell,setHoverCell]=useState(null)
  const[redrawKey,setRedrawKey]=useState(0)

  const{grids,cols,rows,startDow}=useMemo(()=>aggregateGrids(rawGrids,granularity,year),[rawGrids,granularity,year])
  const ausMask=useMemo(()=>watermarkMode?buildAusMask(cols,rows):null,[watermarkMode,cols,rows])

  const trailRef=useRef([])
  const legendBoundsRef=useRef(null)
  const legendHoverTRef=useRef(null)  // 0-1 position hovered on legend, null=none
  const isDraggingLegendRef=useRef(false)
  const rafRef=useRef(null)
  const animStateRef=useRef({grids,metric,dark,cols,rows,size})
  useEffect(()=>{animStateRef.current={grids,metric,dark,cols,rows,size}},[grids,metric,dark,cols,rows,size])

  useEffect(()=>{
    const el=containerRef.current;if(!el)return
    const ro=new ResizeObserver(([e])=>setSize({w:e.contentRect.width,h:e.contentRect.height}))
    ro.observe(el);setSize({w:el.clientWidth,h:el.clientHeight});return()=>ro.disconnect()
  },[])

  useEffect(()=>()=>{if(rafRef.current)cancelAnimationFrame(rafRef.current)},[])
  useEffect(()=>{trailRef.current=[]},[rawGrids,metric,granularity,year,yearType])

  // ── Pixel-text intro animation ────────────────────────────────────────────────
  useEffect(()=>{
    if(!size.w||!size.h)return
    const text=METRIC_TEXT[metric]||metric.toUpperCase()
    const cells=buildTextCells(text,cols,rows)
    const sc=SCALES[metric]  // always use dark scale for the bright end
    const color=interp(sc,1)  // brightest colour in scale
    textAnimRef.current={cells,color,startTime:Date.now()}
    // Cancel any running anim
    if(textRafRef.current)cancelAnimationFrame(textRafRef.current)
    const DURATION=2000,FADE_IN=150
    const animate=()=>{
      const tc=textCanvasRef.current;if(!tc)return
      const ctx=tc.getContext('2d')
      const{cells:cs,color:col2,startTime}=textAnimRef.current
      const elapsed=Date.now()-startTime
      if(elapsed>DURATION){ctx.clearRect(0,0,tc.width,tc.height);textRafRef.current=null;return}
      const alpha=elapsed<FADE_IN
        ? elapsed/FADE_IN
        : 1-((elapsed-FADE_IN)/(DURATION-FADE_IN))
      const plotW=tc.width-PAD.left-PAD.right,plotH=tc.height-PAD.top-PAD.bottom
      const cellW=plotW/cols,cellH=plotH/rows
      ctx.clearRect(0,0,tc.width,tc.height)
      ctx.fillStyle=col2
      ctx.globalAlpha=alpha
      // Dim entire plot first so text pops
      ctx.fillStyle=tc._bgColor||'#111315'
      ctx.globalAlpha=alpha*0.55
      ctx.fillRect(PAD.left,PAD.top,plotW,plotH)
      // Draw lit cells
      ctx.fillStyle=col2
      ctx.globalAlpha=alpha
      cs.forEach(({c,r})=>{
        ctx.fillRect(PAD.left+c*cellW,PAD.top+r*cellH,Math.ceil(cellW)+0.5,Math.ceil(cellH)+0.5)
      })
      ctx.globalAlpha=1
      textRafRef.current=requestAnimationFrame(animate)
    }
    textRafRef.current=requestAnimationFrame(animate)
    return()=>{if(textRafRef.current)cancelAnimationFrame(textRafRef.current)}
  },[metric,cols,rows,size])

  // Draw dots onto any ctx — offsetX/Y are top-left of the plot area in that canvas's coord space
  const paintDots=useCallback((ctx,plotW,plotH,offsetX,offsetY,mask)=>{
    const grid=grids?.[metric];if(!grid)return null
    const cellW=plotW/cols,cellH=plotH/rows
    const dotColor=dark?DOT_COLOR_DARK[metric]:DOT_COLOR_LIGHT[metric]
    let lc=-1,lr=-1
    for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
      const val=grid[c*rows+r];if(val<0)continue
      const norm=metric==='carbon'?val/800:(metric==='renewables'?val/100:Math.min(1,val/50))
      const maxR=Math.min(cellW,cellH)*0.72,minR=Math.min(cellW,cellH)*0.05
      const rr=minR+(maxR-minR)*norm
      ctx.globalAlpha=(mask&&!mask[c*rows+r])?0.05:1
      ctx.beginPath();ctx.arc(offsetX+c*cellW+cellW/2,offsetY+r*cellH+cellH/2,rr,0,Math.PI*2)
      ctx.fillStyle=dotColor;ctx.fill()
      lc=c;lr=r
    }
    ctx.globalAlpha=1
    return lc>=0?{lc,lr,cellW,cellH}:null
  },[grids,metric,dark,cols,rows])

  // ── Main canvas ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!size.w||!size.h)return
    const ctx=canvas.getContext('2d')
    const{w,h}=size
    const plotW=w-PAD.left-PAD.right,plotH=h-PAD.top-PAD.bottom
    const grid=grids?.[metric]
    const cellW=plotW/cols,cellH=plotH/rows

    canvas.width=w;canvas.height=h
    if(trailCanvasRef.current){trailCanvasRef.current.width=w;trailCanvasRef.current.height=h}
    if(textCanvasRef.current){
      textCanvasRef.current.width=w;textCanvasRef.current.height=h
      textCanvasRef.current._bgColor=t.canvasBg
    }
    if(spritesCanvasRef.current){spritesCanvasRef.current.width=w;spritesCanvasRef.current.height=h}

    const MONTH_STARTS=yearType==='FY'?FY_MONTH_STARTS:CY_MONTH_STARTS
    const MONTHS=yearType==='FY'?FY_MONTHS:CY_MONTHS

    ctx.fillStyle=t.canvas;ctx.fillRect(0,0,w,h)
    ctx.fillStyle=t.canvasBg;ctx.fillRect(PAD.left,PAD.top,plotW,plotH)

    if(!dotMode&&year===NOW.year&&grid&&granularity==='30min'){
      ctx.strokeStyle=t.tick;ctx.lineWidth=0.3
      for(let d=0;d<RAW_DAYS;d++)for(let s=0;s<RAW_SLOTS;s++){
        if(grid[d*RAW_SLOTS+s]>=0)continue
        ctx.strokeRect(PAD.left+d*cellW+0.5,PAD.top+s*cellH+0.5,Math.ceil(cellW)-0.5,Math.ceil(cellH)-0.5)
      }
    }

    // Rect mode: draw coloured cells
    if(!dotMode&&grid){
      let lc=-1,lr=-1
      const hoverT=legendHoverTRef.current
      for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
        const val=grid[c*rows+r];if(val<0)continue
        const inMask=!ausMask||ausMask[c*rows+r]
        // Legend hover: check if this cell's normalised value falls in the hovered band
        let legendMatch=true
        if(hoverT!==null){
          const n=metricNorm(metric,val)
          const bands=numBands&&numBands<16?numBands:16
          const bandW=1/bands
          const cellBand=Math.floor(n*bands)/bands   // band start
          const hoverBand=Math.floor(hoverT*bands)/bands
          legendMatch=Math.abs(cellBand-hoverBand)<bandW*0.5+0.001
        }
        const baseAlpha=inMask?1:0.05
        ctx.globalAlpha=hoverT!==null?(legendMatch?1:baseAlpha*0.12):baseAlpha
        ctx.fillStyle=quantizedColor(metric,val,dark,numBands)
        ctx.fillRect(PAD.left+c*cellW,PAD.top+r*cellH,Math.ceil(cellW)+0.5,Math.ceil(cellH)+0.5)
        lc=c;lr=r
      }
      ctx.globalAlpha=1
      if(lc>=0)setLastCell({x:PAD.left+lc*cellW,y:PAD.top+lr*cellH,w:Math.ceil(cellW)+1,h:Math.ceil(cellH)+1})
      else setLastCell(null)
    }

    // Dot mode, no goo: draw dots straight onto this canvas
    if(dotMode&&goo===0){
      const res=paintDots(ctx,plotW,plotH,PAD.left,PAD.top,ausMask)
      if(res)setLastCell({x:PAD.left+res.lc*res.cellW,y:PAD.top+res.lr*res.cellH,w:Math.ceil(res.cellW)+1,h:Math.ceil(res.cellH)+1})
      else setLastCell(null)
    }

    // When goo>0 dots are on gooCanvas — just track lastCell via gooCanvas effect below

    // Grid lines
    const xTicks=(granularity==='daily'||granularity==='weekly')
      ?MONTH_STARTS.map(d=>Math.floor((d+startDow)/7)):MONTH_STARTS
    ctx.strokeStyle='#000000';ctx.lineWidth=1;ctx.beginPath()
    xTicks.forEach(tick=>{const x=Math.round(PAD.left+tick*cellW)+0.5;ctx.moveTo(x,PAD.top-5);ctx.lineTo(x,PAD.top+plotH)})
    if(granularity==='30min'||granularity==='hourly'){
      const step=granularity==='30min'?4:2
      for(let r=0;r<rows;r+=step){const y=Math.round(PAD.top+r*cellH)+0.5;ctx.moveTo(PAD.left-5,y);ctx.lineTo(PAD.left+plotW+5,y)}
    }
    ctx.stroke()

    ctx.font="9px 'DM Mono',monospace";ctx.fillStyle=t.tickLabel;ctx.textBaseline='middle';ctx.textAlign='center'
    if(granularity==='30min'||granularity==='hourly'){
      const step=granularity==='30min'?4:2
      for(let r=0;r<rows;r+=step){
        const y=Math.round(PAD.top+r*cellH)+0.5
        const hh=granularity==='30min'?String(Math.floor(r/2)).padStart(2,'0'):String(r).padStart(2,'0')
        ctx.save();ctx.translate(PAD.left-16,y);ctx.rotate(-Math.PI/2);ctx.fillText(`${hh}:00`,0,0);ctx.restore()
      }
    } else if(granularity==='daily'){
      DOW.forEach((d,i)=>{const y=PAD.top+(i+0.5)*cellH;ctx.save();ctx.translate(PAD.left-16,y);ctx.rotate(-Math.PI/2);ctx.fillText(d,0,0);ctx.restore()})
    } else {
      ctx.save();ctx.translate(PAD.left-16,PAD.top+cellH/2);ctx.rotate(-Math.PI/2);ctx.fillText('avg',0,0);ctx.restore()
    }
    ctx.textAlign='left'

    if(!dark){
      ctx.strokeStyle='#8E8E8E';ctx.lineWidth=0.5;ctx.beginPath()
      for(let c=0;c<=cols;c++){const x=Math.round(PAD.left+c*cellW)+0.5;ctx.moveTo(x,PAD.top);ctx.lineTo(x,PAD.top+plotH)}
      for(let r=0;r<=rows;r++){const y=Math.round(PAD.top+r*cellH)+0.5;ctx.moveTo(PAD.left,y);ctx.lineTo(PAD.left+plotW,y)}
      ctx.stroke()
    }
    ctx.strokeStyle=dark?t.border:'#000000';ctx.lineWidth=1;ctx.strokeRect(PAD.left,PAD.top,plotW,plotH)

    ctx.font="11px 'DM Mono',monospace";ctx.textBaseline='top'
    xTicks.forEach((tick,i)=>{
      const x=PAD.left+tick*cellW
      ctx.fillStyle=t.tick;ctx.fillRect(x,PAD.top+plotH,1,5)
      ctx.fillStyle=t.tickLabel;ctx.fillText(MONTHS[i],x+2,PAD.top+plotH+8)
    })

    const sc=dark?SCALES[metric]:SCALES_LIGHT[metric]
    // ── Vertical legend on right side ──────────────────────────────────────────
    const LH=Math.min(220,plotH*0.65)   // legend height
    const LW=12                          // legend bar width
    const lx=w-PAD.right+14             // x position (right side)
    const ly=PAD.top+(plotH-LH)/2       // vertically centered
    const bands=numBands&&numBands<16?numBands:64
    for(let i=0;i<bands;i++){
      const t0=i/bands,t1=(i+1)/bands
      // Draw top-to-bottom: t0=0 is top (hi value), t1=1 is bottom (lo value)
      const y=ly+t0*LH,h2=(t1-t0)*LH+0.5
      ctx.fillStyle=interp(sc,Math.min(1,1-(t0+0.5/bands)))
      ctx.fillRect(lx,y,LW,h2)
    }
    ctx.strokeStyle=dark?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.3)';ctx.lineWidth=0.5
    ctx.strokeRect(lx,ly,LW,LH)
    // Labels top and bottom
    ctx.font="9px 'DM Mono',monospace";ctx.fillStyle=t.tickLabel
    ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText(LEGEND[metric].hi,lx+LW+5,ly+2)
    ctx.textBaseline='top';ctx.fillText(LEGEND[metric].lo,lx+LW+5,ly+LH-2)
    // Band count label to left of bar
    const bLabel=(!numBands||numBands>=16)?'smooth':`${numBands}`
    ctx.save();ctx.translate(lx-4,ly+LH/2);ctx.rotate(-Math.PI/2)
    ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle=t.muted
    ctx.fillText(bLabel,0,0);ctx.restore()
    // Hover highlight on legend (vertical)
    const hoverT=legendHoverTRef.current
    if(hoverT!==null){
      const nbands=numBands&&numBands<16?numBands:16
      const bandW=1/nbands
      const hoverBandStart=Math.floor((1-hoverT)*nbands)/nbands
      const hy0=ly+hoverBandStart*LH,hbH=bandW*LH
      ctx.save()
      ctx.shadowColor=interp(sc,1-hoverBandStart-bandW*0.5)
      ctx.shadowBlur=8
      ctx.fillStyle=interp(sc,1-hoverBandStart-bandW*0.5)
      ctx.fillRect(lx-3,hy0,LW+6,hbH)
      ctx.restore()
      ctx.strokeStyle=dark?'rgba(255,255,255,0.9)':'rgba(0,0,0,0.8)'
      ctx.lineWidth=1.5;ctx.strokeRect(lx-3,hy0,LW+6,hbH)
    }
    // Store legend bounds for mouse handler (using LH as "LW" so drag still works)
    legendBoundsRef.current={lx,ly,LW:LH,vertical:true}
  },[redrawKey,grids,metric,size,t,dark,dotMode,goo,numBands,watermarkMode,ausMask,cols,rows,granularity,year,yearType,startDow,paintDots,legendHoverTRef])

  // ── Goo canvas (only active when dotMode && goo>0) ────────────────────────────
  // Lives inside a div positioned over the plot area. CSS filter on the div does blur+contrast.
  // The canvas has the same background as the plot so contrast snaps cleanly.
  useEffect(()=>{
    const gc=gooCanvasRef.current;if(!gc)return
    const plotW=size.w-PAD.left-PAD.right,plotH=size.h-PAD.top-PAD.bottom
    if(plotW<=0||plotH<=0)return
    gc.width=plotW;gc.height=plotH
    const ctx=gc.getContext('2d')
    ctx.fillStyle=t.canvasBg;ctx.fillRect(0,0,plotW,plotH)
    if(dotMode&&goo>0){
      const res=paintDots(ctx,plotW,plotH,0,0,ausMask)
      if(res)setLastCell({x:PAD.left+res.lc*res.cellW,y:PAD.top+res.lr*res.cellH,w:Math.ceil(res.cellW)+1,h:Math.ceil(res.cellH)+1})
      else setLastCell(null)
    }
  },[size,t,dotMode,goo,paintDots])

  // ── Sprites canvas ────────────────────────────────────────────────────────────
  useEffect(()=>{
    const sc=spritesCanvasRef.current
    if(!sc||!size.w||!size.h)return
    const ctx=sc.getContext('2d')
    ctx.clearRect(0,0,sc.width,sc.height)
    if(!spritesMode||!grids)return

    const plotW=size.w-PAD.left-PAD.right,plotH=size.h-PAD.top-PAD.bottom
    const cellW=plotW/cols,cellH=plotH/rows
    const sprite=SPRITES[metric];if(!sprite)return
    const color=SPRITE_COLORS[metric]||'#ffffff'
    const peaks=findMonthPeaks(grids,metric,cols,rows,granularity,yearType)

    // Fixed sprite size — always legible regardless of granularity
    const SPRITE_SIZE=40
    const STEM=8   // px gap between peak cell and sprite bottom

    peaks.forEach(({c,r})=>{
      const cellCx=PAD.left+(c+0.5)*cellW
      const cellCy=PAD.top+(r+0.5)*cellH
      // Float sprite above the peak cell
      const spriteCy=cellCy-cellH*0.5-STEM-SPRITE_SIZE*0.5
      const spriteCx=Math.max(PAD.left+SPRITE_SIZE*0.5+2,
                      Math.min(PAD.left+plotW-SPRITE_SIZE*0.5-2, cellCx))

      // Connector: thin line from sprite bottom to peak cell
      ctx.save()
      ctx.strokeStyle=color
      ctx.globalAlpha=0.4
      ctx.lineWidth=1
      ctx.setLineDash([2,2])
      ctx.beginPath()
      ctx.moveTo(spriteCx, spriteCy+SPRITE_SIZE*0.5)
      ctx.lineTo(cellCx, cellCy-cellH*0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Small dot at peak cell
      ctx.save()
      ctx.fillStyle=color
      ctx.shadowColor=color
      ctx.shadowBlur=6
      ctx.globalAlpha=0.9
      ctx.beginPath()
      ctx.arc(cellCx, cellCy, Math.max(2.5, Math.min(cellW*0.4, 4)), 0, Math.PI*2)
      ctx.fill()
      ctx.restore()

      // Sprite
      drawSprite(ctx, sprite, spriteCx, spriteCy, SPRITE_SIZE, SPRITE_SIZE, color, 0.95)
    })
  },[spritesMode,grids,metric,cols,rows,size,granularity,yearType])

  // ── Trail animation (rAF loop on second canvas) ───────────────────────────
  const startTrailAnim=useCallback(()=>{
    if(rafRef.current)return
    const animate=()=>{
      const tc=trailCanvasRef.current;if(!tc){rafRef.current=null;return}
      const tctx=tc.getContext('2d')
      const now=Date.now()
      tctx.clearRect(0,0,tc.width,tc.height)
      // Expire old
      trailRef.current=trailRef.current.filter(c=>now-c.t<TRAIL_DURATION)
      if(trailRef.current.length===0){rafRef.current=null;return}
      const{grids:g,metric:m,dark:dk,cols:nc,rows:nr,size:sz}=animStateRef.current
      if(!sz.w||!sz.h){rafRef.current=requestAnimationFrame(animate);return}
      const plotW=sz.w-PAD.left-PAD.right,plotH=sz.h-PAD.top-PAD.bottom
      const cellW=plotW/nc,cellH=plotH/nr
      const trail=trailRef.current
      const sc=dk?SCALES[m]:SCALES_LIGHT[m]
      for(let i=0;i<trail.length;i++){
        const{col:c,row:r,t:enteredAt}=trail[i]
        const age=(now-enteredAt)/TRAIL_DURATION
        const alpha=Math.pow(1-age,1.5)*0.9
        // Position in trail: newest (end) = 1.0 = brightest end of scale
        const scalePos=i/(Math.max(trail.length-1,1))
        const color=interp(sc,scalePos)
        // Bloom
        tctx.globalAlpha=alpha*0.25
        tctx.fillStyle=color
        tctx.fillRect(PAD.left+c*cellW-2,PAD.top+r*cellH-2,Math.ceil(cellW)+4,Math.ceil(cellH)+4)
        // Core cell
        tctx.globalAlpha=alpha
        tctx.fillStyle=color
        tctx.fillRect(PAD.left+c*cellW,PAD.top+r*cellH,Math.ceil(cellW)+0.5,Math.ceil(cellH)+0.5)
      }
      tctx.globalAlpha=1
      rafRef.current=requestAnimationFrame(animate)
    }
    rafRef.current=requestAnimationFrame(animate)
  },[])

  // ── Mouse move ───────────────────────────────────────────────────────────────
  const applyLegendDrag=useCallback((e)=>{
    const canvas=canvasRef.current;if(!canvas||!legendBoundsRef.current)return false
    const rect=canvas.getBoundingClientRect()
    const{lx,ly,LW:LH}=legendBoundsRef.current
    const mx=e.clientX-rect.left,my=e.clientY-rect.top
    // Vertical legend hit zone
    if(mx>=lx-6&&mx<=lx+18&&my>=ly-4&&my<=ly+LH+4){
      const t=Math.max(0,Math.min(1,(my-ly)/LH))
      // Map 0(top=hi)→1(bot=lo) to bands: top=smooth, bottom=2 colours
      const bands=t<=0.07?null:Math.max(2,Math.round(2+(1-t)*(14/0.93)))
      onNumBandsChange&&onNumBandsChange(bands)
      return true
    }
    return false
  },[onNumBandsChange])

  const handleMouseDown=useCallback((e)=>{
    if(applyLegendDrag(e))isDraggingLegendRef.current=true
  },[applyLegendDrag])

  const handleMouseMove=useCallback((e)=>{
    // If dragging the legend, update bands and skip heatmap hover
    if(isDraggingLegendRef.current){applyLegendDrag(e);return}

    const canvas=canvasRef.current,tip=tooltipRef.current
    if(!canvas||!tip||!size.w||!size.h||!grids)return
    const rect=canvas.getBoundingClientRect(),{w,h}=size
    const x=e.clientX-rect.left-PAD.left,y=e.clientY-rect.top-PAD.top
    const plotW=w-PAD.left-PAD.right,plotH=h-PAD.top-PAD.bottom
    const cellW=plotW/cols,cellH=plotH/rows
    const col=Math.floor(x/cellW),row=Math.floor(y/cellH)

    // Change cursor + set hover band when over legend
    if(legendBoundsRef.current){
      const{lx,ly,LW:LH}=legendBoundsRef.current
      const mx=e.clientX-rect.left,my=e.clientY-rect.top
      if(mx>=lx-6&&mx<=lx+18&&my>=ly-4&&my<=ly+LH+4){
        canvas.style.cursor='ns-resize'
        tip.style.display='none'
        setHoverCell(null)
        const newT=Math.max(0,Math.min(0.9999,(my-ly)/LH))
        if(legendHoverTRef.current!==newT){
          legendHoverTRef.current=newT
          setRedrawKey(k=>k+1)
        }
        return
      }
    }
    // Left legend zone — clear hover highlight
    if(legendHoverTRef.current!==null){
      legendHoverTRef.current=null
      setRedrawKey(k=>k+1)
    }
    canvas.style.cursor='crosshair'

    if(x<0||y<0||col<0||row<0||col>=cols||row>=rows){
      tip.style.display='none';setHoverCell(null);return
    }
    setHoverCell({x:PAD.left+col*cellW,y:PAD.top+row*cellH,w:Math.ceil(cellW)+1,h:Math.ceil(cellH)+1})

    // Push to trail if cell changed
    const last=trailRef.current[trailRef.current.length-1]
    if(!last||last.col!==col||last.row!==row){
      trailRef.current.push({col,row,t:Date.now()})
      if(trailRef.current.length>TRAIL_MAX)trailRef.current.shift()
      startTrailAnim()
    }

    // Tooltip date string
    const val=grids[metric]?.[col*rows+row]
    const fyOff=yearType==='FY'?FY_START_DAY:0
    const tipX=e.clientX-rect.left+14,tipY=e.clientY-rect.top-12
    let dateStr
    if(granularity==='daily'){
      const day=col*7+row
      const d=new Date(year,0,fyOff+day+1)
      dateStr=DOW[row]+', '+d.getDate()+' '+d.toLocaleString('en-AU',{month:'short'})
    } else if(granularity==='weekly'){
      const ds=new Date(year,0,fyOff+col*7+1)
      const de=new Date(year,0,fyOff+Math.min(col*7+6,RAW_DAYS-1)+1)
      const fmt=d=>d.getDate()+' '+d.toLocaleString('en-AU',{month:'short'})
      dateStr='W'+(col+1)+': '+fmt(ds)+'\u2013'+fmt(de)
    } else if(granularity==='hourly'){
      const d=new Date(year,0,fyOff+col+1)
      dateStr=d.getDate()+' '+d.toLocaleString('en-AU',{month:'short'})+' \u00b7 '+String(row).padStart(2,'0')+':00'
    } else {
      const d=new Date(year,0,fyOff+col+1)
      const hh=String(Math.floor(row/2)).padStart(2,'0'),mm=row%2===0?'00':'30'
      dateStr=d.getDate()+' '+d.toLocaleString('en-AU',{month:'short'})+' \u00b7 '+hh+':'+mm
    }

    if(val==null||val<0){
      tip.innerHTML=`<div style="font-family:'DM Mono',monospace;font-size:11px;line-height:1.5"><div style="font-weight:600">${dateStr}</div><div style="margin-top:3px;opacity:0.4;font-size:10px">no data yet</div></div>`
      tip.style.left=(tipX+170>w?tipX-180:tipX)+'px';tip.style.top=Math.max(0,tipY)+'px';tip.style.display='block';return
    }
    const label=tooltipLabel(metric,val)
    const barPct=metric==='carbon'?Math.round(Math.max(15,(1-val/100)*750))/800*100:metric==='renewables'?val:metric==='battery'?Math.min(100,val/15*100):Math.min(100,val/50*100)
    const barColor=metricColor(metric,val,dark)
    tip.innerHTML=`
      <div style="font-family:'DM Mono',monospace;font-size:11px;line-height:1.5">
        <div style="font-weight:600;margin-bottom:5px">${dateStr}</div>
        <div style="margin-bottom:6px;opacity:0.8">${label}</div>
        <div style="position:relative;height:5px;border-radius:3px;background:${dark?'#2a2d30':'#ddd9d0'};overflow:hidden">
          <div style="position:absolute;left:0;top:0;height:100%;width:${barPct.toFixed(1)}%;background:${barColor};border-radius:3px"></div>
        </div>
      </div>`
    tip.style.left=(tipX+170>w?tipX-180:tipX)+'px';tip.style.top=Math.max(0,tipY)+'px';tip.style.display='block'
  },[size,metric,grids,year,dark,t,dotMode,cols,rows,granularity,yearType,startTrailAnim])

  const handleMouseLeave=useCallback(()=>{
    if(tooltipRef.current)tooltipRef.current.style.display='none'
    setHoverCell(null)
    isDraggingLegendRef.current=false
    if(legendHoverTRef.current!==null){legendHoverTRef.current=null;setRedrawKey(k=>k+1)}
  },[])
  const handleMouseUp=useCallback(()=>{isDraggingLegendRef.current=false},[])

  const handleClick=useCallback((e)=>{
    applyLegendDrag(e)
  },[applyLegendDrag])

  return(
    <div ref={containerRef} style={{width:'100%',height:'100%',position:'relative'}}>
      <style>{`@keyframes livepulse{0%,100%{opacity:1;box-shadow:0 0 0 0px rgba(74,222,128,0.8)}50%{opacity:.6;box-shadow:0 0 0 3px rgba(74,222,128,0)}}`}</style>
      {size.w>0&&size.h>0&&(()=>{
        const plotW=size.w-PAD.left-PAD.right,plotH=size.h-PAD.top-PAD.bottom
        const GOO=[{blur:0,contrast:1},{blur:3,contrast:18},{blur:6,contrast:30},{blur:11,contrast:50}]
        const{blur,contrast}=GOO[goo]||GOO[0]
        return(<>
          {/* Layer 1: full canvas — bg, axes, labels, legend, rect cells, dots when goo=0 */}
          <canvas ref={canvasRef} width={size.w} height={size.h}
            style={{display:'block',cursor:'crosshair',position:'absolute',left:0,top:0}}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp} onClick={handleClick}
          />
          {/* Layer 2: goo div — sits exactly over plot area, clips overflow, applies blur+contrast */}
          {/* Canvas inside has same bg as plot so contrast filter snaps cleanly */}
          {dotMode&&goo>0&&(
            <div style={{position:'absolute',left:PAD.left,top:PAD.top,
              width:plotW,height:plotH,overflow:'hidden',pointerEvents:'none',
              filter:`blur(${blur}px) contrast(${contrast})`}}>
              <canvas ref={gooCanvasRef} width={plotW} height={plotH}
                style={{display:'block'}}/>
            </div>
          )}
          {/* Layer 3: trail canvas */}
          <canvas ref={trailCanvasRef} width={size.w} height={size.h}
            style={{position:'absolute',left:0,top:0,pointerEvents:'none'}}
          />
          {/* Layer 4: sprite mascots */}
          <canvas ref={spritesCanvasRef} width={size.w} height={size.h}
            style={{position:'absolute',left:0,top:0,pointerEvents:'none'}}
          />
          {/* Layer 5: pixel-text intro animation */}
          <canvas ref={textCanvasRef} width={size.w} height={size.h}
            style={{position:'absolute',left:0,top:0,pointerEvents:'none'}}
          />
          {/* Hover cell border */}
          {hoverCell&&(
            <div style={{position:'absolute',left:hoverCell.x,top:hoverCell.y,width:hoverCell.w,height:hoverCell.h,
              border:`1.5px solid ${dark?'rgba(255,255,255,0.9)':'rgba(0,0,0,0.85)'}`,
              borderRadius:1,pointerEvents:'none',zIndex:6}}/>
          )}
          {/* Live-data pulse */}
          {lastCell&&year===NOW.year&&(
            <div style={{position:'absolute',left:lastCell.x,top:lastCell.y,width:lastCell.w,height:lastCell.h,
              border:'1.5px solid #4ade80',borderRadius:1,pointerEvents:'none',
              animation:'livepulse 1.8s ease-in-out infinite',zIndex:5}}/>
          )}
          <div ref={tooltipRef} style={{display:'none',position:'absolute',pointerEvents:'none',
            background:t.tooltip.bg,border:`1px solid ${t.tooltip.border}`,borderRadius:6,
            padding:'8px 12px',fontSize:11,fontFamily:"'DM Mono',monospace",
            color:t.tooltip.text,lineHeight:1.6,whiteSpace:'nowrap',zIndex:10}}/>
        </>)
      })()}
    </div>
  )
}


// ── FacilityGrid ──────────────────────────────────────────────────────────────
// Same 365×48 (30-min) grid as energy data.
// Each facility occupies cells proportional to its MW.
// Cells are filled solid with the energy-data colour for that fueltech.
// A black keyline marks every boundary between facilities.

const FUELTECH_METRIC={
  coal:'coal',gas:'gas',
  wind:'renewables',solar_utility:'solar',solar_rooftop:'solar',hydro:'wind',
  battery:'battery',biomass:'renewables',
}
function facilityColor(fueltech){
  return FUELTECH_COLOR[fueltech]||'#888888'
}

function buildFacilityMap(facilities,region){
  const cols=RAW_DAYS,rows=RAW_SLOTS,totalCells=cols*rows
  const facs=facilities
    .filter(f=>f.status!=='retired'&&(region==='NEM'||f.region===region))
    .slice()
    .sort((a,b)=>{
      const ord=['coal','gas','wind','solar_utility','solar_rooftop','hydro','battery','biomass']
      const ai=ord.indexOf(a.fueltech),bi=ord.indexOf(b.fueltech)
      return ai===bi?b.mw-a.mw:ai-bi
    })
  const totalMW=facs.reduce((s,f)=>s+f.mw,0)
  if(!totalMW)return{facs:[],map:new Int16Array(totalCells).fill(-1)}
  // Each facility gets floor(mw/totalMW * cols) columns minimum,
  // then distribute remainder columns one-by-one to largest remainders.
  const exact=facs.map(f=>(f.mw/totalMW)*cols)
  const colCounts=exact.map(e=>Math.floor(e))
  const remainders=exact.map((e,i)=>({i,r:e-colCounts[i]}))
  const deficit=cols-colCounts.reduce((s,c)=>s+c,0)
  remainders.sort((a,b)=>b.r-a.r)
  for(let k=0;k<deficit;k++)colCounts[remainders[k].i]++

  // Ensure every facility gets at least 1 column; steal from the largest
  let largest=0
  colCounts.forEach((c,i)=>{if(c>colCounts[largest])largest=i})
  colCounts.forEach((c,i)=>{if(c===0){colCounts[i]=1;colCounts[largest]--}})

  // Fill map column-major, one full column block per facility
  const map=new Int16Array(totalCells).fill(-1)
  let col=0
  facs.forEach((f,fi)=>{
    const end=Math.min(col+colCounts[fi],cols)
    for(let c=col;c<end;c++)
      for(let r=0;r<rows;r++)
        map[c*rows+r]=fi
    col=end
  })
  return{facs,map}
}

function buildTreemapMap(facilities,region,plotW,plotH){
  const cols=RAW_DAYS,rows=RAW_SLOTS
  const totalCells=cols*rows
  const facs=facilities
    .filter(f=>f.status!=='retired'&&(region==='NEM'||f.region===region))
    .slice()
    .sort((a,b)=>b.mw-a.mw)
  if(!facs.length||!plotW||!plotH)return{facs:[],map:new Int16Array(totalCells).fill(-1)}

  const items=facs.map(f=>({...f,value:f.mw}))
  const rects=squarify(items,0,0,plotW,plotH)

  const cellW=plotW/cols,cellH=plotH/rows
  const map=new Int16Array(totalCells).fill(-1)

  // Assign each cell to the rect whose bounds contain the cell centre
  rects.forEach((rect,i)=>{
    const c0=Math.max(0,Math.floor(rect.x/cellW))
    const r0=Math.max(0,Math.floor(rect.y/cellH))
    const c1=Math.min(cols,Math.ceil((rect.x+rect.w)/cellW))
    const r1=Math.min(rows,Math.ceil((rect.y+rect.h)/cellH))
    for(let c=c0;c<c1;c++){
      for(let r=r0;r<r1;r++){
        const cx=(c+0.5)*cellW,cy=(r+0.5)*cellH
        if(cx>=rect.x&&cx<rect.x+rect.w&&cy>=rect.y&&cy<rect.y+rect.h)
          map[c*rows+r]=i
      }
    }
  })

  // Assign any gap cells to nearest rect by centre distance
  for(let c=0;c<cols;c++){
    for(let r=0;r<rows;r++){
      if(map[c*rows+r]>=0)continue
      const cx=(c+0.5)*cellW,cy=(r+0.5)*cellH
      let bestI=0,bestD=Infinity
      rects.forEach((rect,i)=>{
        const dx=cx-(rect.x+rect.w/2),dy=cy-(rect.y+rect.h/2)
        const d=dx*dx+dy*dy
        if(d<bestD){bestD=d;bestI=i}
      })
      map[c*rows+r]=bestI
    }
  }

  return{facs,map}
}

// ── Bubble layout — force-packed circles sized by MW ─────────────────────────
function buildBubbleLayout(facilities,region,plotW,plotH){
  const facs=facilities
    .filter(f=>f.status!=='retired'&&(region==='NEM'||f.region===region))
    .slice()
    .sort((a,b)=>b.mw-a.mw)
  if(!facs.length||!plotW||!plotH)return{facs:[],bubbles:[]}

  const totalMW=facs.reduce((s,f)=>s+f.mw,0)
  // 55% fill — leaves room for separation without wasting space
  const totalArea=plotW*plotH*0.45
  const areaPerMW=totalArea/totalMW
  const radii=facs.map(f=>Math.sqrt((f.mw*areaPerMW)/Math.PI))

  // Initial positions: place large bubbles first in a grid, smaller ones fill gaps
  const cx=plotW/2,cy=plotH/2
  const bubbles=facs.map((f,i)=>{
    const angle=(i/facs.length)*Math.PI*8
    const dist=Math.sqrt(i/facs.length)*Math.min(plotW,plotH)*0.40
    return{x:cx+Math.cos(angle)*dist,y:cy+Math.sin(angle)*dist,r:radii[i]}
  })

  // Clamp to bounds
  const clamp=b=>{
    const pad=b.r+1
    b.x=Math.max(pad,Math.min(plotW-pad,b.x))
    b.y=Math.max(pad,Math.min(plotH-pad,b.y))
  }
  bubbles.forEach(clamp)

  // Full-strength separation — resolve completely each pass, no cooling
  const separate=()=>{
    let moved=false
    for(let a=0;a<bubbles.length;a++){
      for(let b=a+1;b<bubbles.length;b++){
        const ba=bubbles[a],bb=bubbles[b]
        const dx=bb.x-ba.x,dy=bb.y-ba.y
        const dist=Math.sqrt(dx*dx+dy*dy)||0.001
        const minD=ba.r+bb.r+1
        if(dist<minD){
          const half=(minD-dist)/dist*0.5
          ba.x-=dx*half;ba.y-=dy*half
          bb.x+=dx*half;bb.y+=dy*half
          clamp(ba);clamp(bb)
          moved=true
        }
      }
    }
    return moved
  }

  // Gentle centre pull then full separation — repeat until stable
  for(let iter=0;iter<400;iter++){
    // Centre pull only in first half
    if(iter<200){
      bubbles.forEach(b=>{
        b.x+=(cx-b.x)*0.01
        b.y+=(cy-b.y)*0.01
        clamp(b)
      })
    }
    separate()
  }
  // Final guarantee: iterate separate until no overlaps
  for(let pass=0;pass<200;pass++){
    if(!separate())break
  }

  return{facs,bubbles}
}

function FacilityGrid({region,theme:t,dark,layout='horizontal'}){
  const containerRef=useRef(null)
  const canvasRef=useRef(null)
  const tooltipRef=useRef(null)
  const[size,setSize]=useState({w:0,h:0})
  const[hovered,setHovered]=useState(null)
  const[hoveredBubblePos,setHoveredBubblePos]=useState(null)
  const mapRef=useRef({facs:[],map:new Int16Array(0)})
  const bubblesRef=useRef({facs:[],bubbles:[]})
  // Live physics state (not React state — mutated each frame)
  const physicsRef=useRef(null) // {balls:[{x,y,vx,vy,r,fi}], facs, totalMW}
  const cursorRef=useRef({x:-9999,y:-9999,inside:false})
  const rafRef=useRef(null)
  const hoveredRef=useRef(null)

  useEffect(()=>{
    const el=containerRef.current;if(!el)return
    const ro=new ResizeObserver(([e])=>setSize({w:e.contentRect.width,h:e.contentRect.height}))
    ro.observe(el);setSize({w:el.clientWidth,h:el.clientHeight});return()=>ro.disconnect()
  },[])

  const plotW=size.w-PAD.left-PAD.right
  const plotH=size.h-PAD.top-PAD.bottom

  const gridData=useMemo(()=>{
    if(layout==='bubbles')return{facs:[],map:new Int16Array(0)}
    const r=layout==='treemap'
      ?buildTreemapMap(FACILITIES,region,plotW,plotH)
      :buildFacilityMap(FACILITIES,region)
    mapRef.current=r;return r
  },[region,layout,plotW,plotH])

  const facs=gridData.facs
  const map=gridData.map

  // ── Bubble physics init ───────────────────────────────────────────────────
  const initBubbles=useCallback((shuffle=false)=>{
    if(!plotW||!plotH)return
    const fs=FACILITIES.filter(f=>f.status!=='retired'&&(region==='NEM'||f.region===region))
      .slice().sort((a,b)=>b.mw-a.mw)
    if(!fs.length)return
    const totalMW=fs.reduce((s,f)=>s+f.mw,0)
    const totalArea=plotW*plotH*0.45
    const areaPerMW=totalArea/totalMW
    const radii=fs.map(f=>Math.sqrt((f.mw*areaPerMW)/Math.PI))
    const cx=plotW/2,cy=plotH/2
    let balls
    if(shuffle&&physicsRef.current){
      // Keep existing radii/fi, fling to random positions with velocity
      balls=physicsRef.current.balls.map((b,i)=>({
        ...b,
        x:PAD.left+(Math.random()*0.6+0.2)*plotW,
        y:PAD.top+(Math.random()*0.6+0.2)*plotH,
        vx:(Math.random()-0.5)*18,
        vy:(Math.random()-0.5)*18,
      }))
    } else {
      // Fresh spiral placement, settled
      const settled=buildBubbleLayout(FACILITIES,region,plotW,plotH)
      bubblesRef.current=settled
      balls=settled.bubbles.map((b,i)=>({
        x:PAD.left+b.x,y:PAD.top+b.y,vx:0,vy:0,r:b.r,fi:i
      }))
    }
    physicsRef.current={balls,facs:fs,totalMW}
  },[region,plotW,plotH])

  // Start/stop RAF loop for bubbles
  useEffect(()=>{
    if(layout!=='bubbles'){
      if(rafRef.current)cancelAnimationFrame(rafRef.current)
      rafRef.current=null
      physicsRef.current=null
      return
    }
    if(!size.w||!size.h)return
    initBubbles(false)

    const canvas=canvasRef.current;if(!canvas)return
    canvas.width=size.w;canvas.height=size.h
    const ctx=canvas.getContext('2d')
    const{w,h}=size
    const pW=plotW,pH=plotH

    const drawBg=()=>{
      ctx.fillStyle=t.canvas;ctx.fillRect(0,0,w,h)
      ctx.fillStyle=t.canvasBg;ctx.fillRect(PAD.left,PAD.top,pW,pH)
    }

    const drawLegend=(fs,totalMW)=>{
      const ly=h-28
      ctx.font="10px 'DM Mono',monospace";ctx.textBaseline='middle';ctx.textAlign='left'
      const seen=new Set();let lx=PAD.left
      fs.forEach(f=>{
        if(seen.has(f.fueltech))return;seen.add(f.fueltech)
        const color=facilityColor(f.fueltech)
        const mw=fs.filter(x=>x.fueltech===f.fueltech).reduce((s,x)=>s+x.mw,0)
        if(!mw||lx>w-PAD.right-140)return
        ctx.fillStyle=color;ctx.beginPath();ctx.arc(lx+4,ly,4,0,Math.PI*2);ctx.fill()
        ctx.strokeStyle='#000';ctx.lineWidth=0.5;ctx.stroke()
        ctx.fillStyle=t.tickLabel
        const label=`${FUELTECH_LABEL[f.fueltech]||f.fueltech} ${mw>=1000?(mw/1000).toFixed(1)+'GW':mw+'MW'}`
        ctx.fillText(label,lx+12,ly);lx+=ctx.measureText(label).width+20
      })
      ctx.textAlign='right';ctx.fillStyle=t.tickLabel
      ctx.fillText(`${(totalMW/1000).toFixed(1)} GW total · ${fs.length} facilities`,w-PAD.right,ly)
    }

    const DAMPING=0.88
    const CURSOR_REPEL=3200
    const WALL_REPEL=320
    const MAX_V=14

    const tick=()=>{
      const phys=physicsRef.current
      if(!phys){rafRef.current=requestAnimationFrame(tick);return}
      const{balls,facs:fs,totalMW}=phys
      const{x:mx,y:my,inside}=cursorRef.current
      const CURSOR_R=60

      // Physics step
      for(let i=0;i<balls.length;i++){
        const b=balls[i]
        // Cursor repulsion
        if(inside){
          const dx=b.x-mx,dy=b.y-my
          const d=Math.sqrt(dx*dx+dy*dy)||0.01
          const range=b.r+CURSOR_R
          if(d<range){
            const f=CURSOR_REPEL/(d*d)
            b.vx+=dx/d*f;b.vy+=dy/d*f
          }
        }
        // Wall repulsion
        const pl=PAD.left+b.r+2,pr=PAD.left+pW-b.r-2
        const pt=PAD.top+b.r+2,pb=PAD.top+pH-b.r-2
        if(b.x<pl+30)b.vx+=WALL_REPEL/(Math.max(1,b.x-pl)**2)
        if(b.x>pr-30)b.vx-=WALL_REPEL/(Math.max(1,pr-b.x)**2)
        if(b.y<pt+30)b.vy+=WALL_REPEL/(Math.max(1,b.y-pt)**2)
        if(b.y>pb-30)b.vy-=WALL_REPEL/(Math.max(1,pb-b.y)**2)
        // Integrate + damp
        b.vx=Math.max(-MAX_V,Math.min(MAX_V,b.vx*DAMPING))
        b.vy=Math.max(-MAX_V,Math.min(MAX_V,b.vy*DAMPING))
        b.x+=b.vx;b.y+=b.vy
        // Hard boundary clamp
        b.x=Math.max(pl,Math.min(pr,b.x))
        b.y=Math.max(pt,Math.min(pb,b.y))
      }

      // Circle–circle separation (5 passes per frame for dense packing)
      for(let pass=0;pass<5;pass++){
        for(let a=0;a<balls.length;a++){
          for(let b2=a+1;b2<balls.length;b2++){
            const ba=balls[a],bb=balls[b2]
            const dx=bb.x-ba.x,dy=bb.y-ba.y
            const d=Math.sqrt(dx*dx+dy*dy)||0.001
            const minD=ba.r+bb.r+1
            if(d<minD){
              const half=(minD-d)/d*0.5
              ba.x-=dx*half;ba.y-=dy*half
              bb.x+=dx*half;bb.y+=dy*half
              // Transfer velocity (elastic-ish)
              const nx=dx/d,ny=dy/d
              const dv=(ba.vx-bb.vx)*nx+(ba.vy-bb.vy)*ny
              if(dv>0){
                ba.vx-=dv*nx*0.5;ba.vy-=dv*ny*0.5
                bb.vx+=dv*nx*0.5;bb.vy+=dv*ny*0.5
              }
              // Re-clamp after each push
              const pl2=PAD.left+ba.r+2,pr2=PAD.left+pW-ba.r-2
              const pt2=PAD.top+ba.r+2,pb2=PAD.top+pH-ba.r-2
              ba.x=Math.max(pl2,Math.min(pr2,ba.x));ba.y=Math.max(pt2,Math.min(pb2,ba.y))
              const pl3=PAD.left+bb.r+2,pr3=PAD.left+pW-bb.r-2
              const pt3=PAD.top+bb.r+2,pb3=PAD.top+pH-bb.r-2
              bb.x=Math.max(pl3,Math.min(pr3,bb.x));bb.y=Math.max(pt3,Math.min(pb3,bb.y))
            }
          }
        }
      }

      // Draw
      drawBg()
      // Clip bubbles to plot area
      ctx.save();ctx.beginPath();ctx.rect(PAD.left,PAD.top,pW,pH);ctx.clip()
      balls.forEach((b,i)=>{
        const f=fs[b.fi];if(!f)return
        const color=facilityColor(f.fueltech)
        const isHov=hoveredRef.current===i
        ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2)
        ctx.fillStyle=color;ctx.fill()
        ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2)
        ctx.strokeStyle='#000000';ctx.lineWidth=isHov?1.5:1;ctx.stroke()
      })
      ctx.restore()

      // Border
      ctx.strokeStyle=dark?t.border:'#000000';ctx.lineWidth=1
      ctx.strokeRect(PAD.left,PAD.top,pW,pH)

      // Cursor dot
      if(cursorRef.current.inside){
        const{x:mx,y:my}=cursorRef.current
        ctx.beginPath();ctx.arc(mx,my,4,0,Math.PI*2)
        ctx.fillStyle='#000000';ctx.fill()
      }

      drawLegend(fs,totalMW)

      // Update hover div position if hovering
      if(hoveredRef.current!==null){
        const b=balls[hoveredRef.current]
        if(b)setHoveredBubblePos({cx:b.x,cy:b.y,r:b.r})
      }

      rafRef.current=requestAnimationFrame(tick)
    }

    rafRef.current=requestAnimationFrame(tick)
    return()=>{if(rafRef.current)cancelAnimationFrame(rafRef.current)}
  },[layout,size,t,dark,initBubbles])

  // Shuffle callback exposed via ref so toolbar can call it
  const shuffleRef=useRef(null)
  shuffleRef.current=useCallback(()=>initBubbles(true),[initBubbles])

  // Grid draw (non-bubble layouts) — unchanged
  useEffect(()=>{
    if(layout==='bubbles')return
    const canvas=canvasRef.current;if(!canvas||!size.w||!size.h)return
    canvas.width=size.w;canvas.height=size.h
    const ctx=canvas.getContext('2d')
    const{w,h}=size
    const cols=RAW_DAYS,rows=RAW_SLOTS
    const pW=w-PAD.left-PAD.right,pH=h-PAD.top-PAD.bottom
    const cellW=pW/cols,cellH=pH/rows

    ctx.fillStyle=t.canvas;ctx.fillRect(0,0,w,h)
    ctx.fillStyle=t.canvasBg;ctx.fillRect(PAD.left,PAD.top,pW,pH)

    const colors=facs.map(f=>facilityColor(f.fueltech))
    for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
      const fi=map[c*rows+r];if(fi<0)continue
      ctx.fillStyle=colors[fi]
      ctx.fillRect(PAD.left+c*cellW,PAD.top+r*cellH,Math.ceil(cellW)+0.5,Math.ceil(cellH)+0.5)
    }

    ctx.strokeStyle=dark?'rgba(0,0,0,0.9)':'#000000';ctx.lineWidth=dark?0.7:0.9;ctx.beginPath()
    for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
      const fi=map[c*rows+r]
      if(c<cols-1&&map[(c+1)*rows+r]!==fi){
        const x=Math.round(PAD.left+(c+1)*cellW)+0.5
        ctx.moveTo(x,Math.round(PAD.top+r*cellH));ctx.lineTo(x,Math.round(PAD.top+(r+1)*cellH))
      }
      if(r<rows-1&&map[c*rows+r+1]!==fi){
        const y=Math.round(PAD.top+(r+1)*cellH)+0.5
        ctx.moveTo(Math.round(PAD.left+c*cellW),y);ctx.lineTo(Math.round(PAD.left+(c+1)*cellW),y)
      }
    }
    ctx.stroke()

    if(hovered!==null){
      ctx.fillStyle='rgba(255,255,255,0.22)'
      for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
        if(map[c*rows+r]!==hovered)continue
        ctx.fillRect(PAD.left+c*cellW,PAD.top+r*cellH,Math.ceil(cellW)+0.5,Math.ceil(cellH)+0.5)
      }
      ctx.strokeStyle=dark?'#ffffff':'#000000';ctx.lineWidth=1.5;ctx.beginPath()
      for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
        if(map[c*rows+r]!==hovered)continue
        const x0=Math.round(PAD.left+c*cellW)+0.5,y0=Math.round(PAD.top+r*cellH)+0.5
        const x1=Math.round(PAD.left+(c+1)*cellW)+0.5,y1=Math.round(PAD.top+(r+1)*cellH)+0.5
        if(c===0||map[(c-1)*rows+r]!==hovered){ctx.moveTo(x0,y0);ctx.lineTo(x0,y1)}
        if(c===cols-1||map[(c+1)*rows+r]!==hovered){ctx.moveTo(x1,y0);ctx.lineTo(x1,y1)}
        if(r===0||map[c*rows+r-1]!==hovered){ctx.moveTo(x0,y0);ctx.lineTo(x1,y0)}
        if(r===rows-1||map[c*rows+r+1]!==hovered){ctx.moveTo(x0,y1);ctx.lineTo(x1,y1)}
      }
      ctx.stroke()
    }

    ctx.strokeStyle=dark?t.border:'#000000';ctx.lineWidth=1
    ctx.strokeRect(PAD.left,PAD.top,pW,pH)

    ctx.font="9px 'DM Mono',monospace";ctx.fillStyle=t.tickLabel
    ctx.textBaseline='middle';ctx.textAlign='center'
    for(let r=0;r<rows;r+=4){
      const y=Math.round(PAD.top+r*cellH)+0.5
      const hh=String(Math.floor(r/2)).padStart(2,'0')
      ctx.save();ctx.translate(PAD.left-16,y);ctx.rotate(-Math.PI/2)
      ctx.fillText(`${hh}:00`,0,0);ctx.restore()
    }

    const totalMW=facs.reduce((s,f)=>s+f.mw,0)
    const ly=h-28
    ctx.font="10px 'DM Mono',monospace";ctx.textBaseline='middle';ctx.textAlign='left'
    const seen=new Set();let lx=PAD.left
    facs.forEach(f=>{
      if(seen.has(f.fueltech))return;seen.add(f.fueltech)
      const color=facilityColor(f.fueltech)
      const mw=facs.filter(x=>x.fueltech===f.fueltech).reduce((s,x)=>s+x.mw,0)
      if(!mw||lx>w-PAD.right-140)return
      ctx.fillStyle=color;ctx.fillRect(lx,ly-4,8,8)
      ctx.strokeStyle=dark?'rgba(0,0,0,0.6)':'#000';ctx.lineWidth=0.5;ctx.strokeRect(lx,ly-4,8,8)
      ctx.fillStyle=t.tickLabel
      const label=`${FUELTECH_LABEL[f.fueltech]||f.fueltech} ${mw>=1000?(mw/1000).toFixed(1)+'GW':mw+'MW'}`
      ctx.fillText(label,lx+11,ly);lx+=ctx.measureText(label).width+18
    })
    ctx.textAlign='right';ctx.fillStyle=t.tickLabel
    ctx.fillText(`${(totalMW/1000).toFixed(1)} GW total · ${facs.length} facilities`,w-PAD.right,ly)
  },[facs,map,hovered,layout,size,t,dark])

  // Mouse
  const handleMouseMove=useCallback(e=>{
    const canvas=canvasRef.current;if(!canvas)return
    const rect=canvas.getBoundingClientRect()
    const mx=e.clientX-rect.left,my=e.clientY-rect.top
    const tip=tooltipRef.current

    if(layout==='bubbles'){
      cursorRef.current={x:mx,y:my,inside:true}
      const phys=physicsRef.current;if(!phys)return
      const{balls,facs:fs,totalMW}=phys
      let found=-1
      for(let i=0;i<balls.length;i++){
        const b=balls[i]
        const dx=mx-b.x,dy=my-b.y
        if(dx*dx+dy*dy<=(b.r)*(b.r)){found=i;break}
      }
      hoveredRef.current=found>=0?found:null
      setHovered(found>=0?found:null)
      if(found>=0){
        const b=balls[found]
        setHoveredBubblePos({cx:b.x,cy:b.y,r:b.r})
      }else setHoveredBubblePos(null)
      if(tip){
        if(found>=0&&fs[balls[found].fi]){
          const f=fs[balls[found].fi]
          const color=facilityColor(f.fueltech)
          const mwLabel=f.mw>=1000?(f.mw/1000).toFixed(2)+' GW':f.mw+' MW'
          tip.style.display='block'
          tip.style.left=(mx+14+170>rect.width?mx-184:mx+14)+'px'
          tip.style.top=Math.max(0,my-12)+'px'
          tip.innerHTML=`<div style="font-family:'DM Mono',monospace;font-size:11px;line-height:1.5">`
            +`<div style="font-weight:600;margin-bottom:5px">${f.name}</div>`
            +`<div style="margin-bottom:6px;opacity:0.8">${mwLabel} · ${FUELTECH_LABEL[f.fueltech]||f.fueltech}</div>`
            +`<div style="position:relative;height:5px;border-radius:3px;background:${dark?'#2a2d30':'#ddd9d0'};overflow:hidden">`
            +`<div style="position:absolute;left:0;top:0;height:100%;width:${((f.mw/totalMW)*100).toFixed(1)}%;background:${color};border-radius:3px"></div>`
            +`</div></div>`
        }else tip.style.display='none'
      }
      return
    }

    const cols=RAW_DAYS,rows=RAW_SLOTS
    const pW=canvas.width-PAD.left-PAD.right,pH=canvas.height-PAD.top-PAD.bottom
    const c=Math.floor((mx-PAD.left)/(pW/cols)),r=Math.floor((my-PAD.top)/(pH/rows))
    const{facs:fs,map:mp}=mapRef.current
    const inBounds=c>=0&&c<cols&&r>=0&&r<rows
    const fi=inBounds?mp[c*rows+r]:-1
    setHovered(fi>=0?fi:null)
    if(tip){
      if(fi>=0&&fs[fi]){
        const f=fs[fi];const color=facilityColor(f.fueltech)
        const totalMW=fs.reduce((s,x)=>s+x.mw,0)
        tip.style.display='block'
        tip.style.left=Math.min(mx+16,rect.width-224)+'px'
        tip.style.top=Math.max(my-68,4)+'px'
        tip.innerHTML=`<div style="font-family:'DM Mono',monospace;font-size:11px;line-height:1.5">`
          +`<div style="font-weight:600;margin-bottom:5px">${f.name}</div>`
          +`<div style="margin-bottom:6px;opacity:0.8">${f.mw>=1000?(f.mw/1000).toFixed(2)+' GW':f.mw+' MW'} · ${FUELTECH_LABEL[f.fueltech]||f.fueltech}</div>`
          +`<div style="position:relative;height:5px;border-radius:3px;background:${dark?'#2a2d30':'#ddd9d0'};overflow:hidden">`
          +`<div style="position:absolute;left:0;top:0;height:100%;width:${((f.mw/totalMW)*100).toFixed(1)}%;background:${color};border-radius:3px"></div>`
          +`</div></div>`
      }else tip.style.display='none'
    }
  },[layout,dark])

  const handleMouseLeave=useCallback(()=>{
    cursorRef.current={x:-9999,y:-9999,inside:false}
    hoveredRef.current=null
    setHovered(null);setHoveredBubblePos(null)
    if(tooltipRef.current)tooltipRef.current.style.display='none'
  },[])

  return(
    <div ref={containerRef} style={{width:'100%',height:'100%',position:'relative'}}>
      <canvas ref={canvasRef}
        style={{display:'block',position:'absolute',inset:0,cursor:layout==='bubbles'?'none':'crosshair'}}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      />
      {/* Hover ring */}
      {layout==='bubbles'&&hoveredBubblePos&&(
        <div style={{position:'absolute',
          left:hoveredBubblePos.cx-hoveredBubblePos.r,top:hoveredBubblePos.cy-hoveredBubblePos.r,
          width:hoveredBubblePos.r*2,height:hoveredBubblePos.r*2,borderRadius:'50%',
          border:`1.5px solid ${dark?'rgba(255,255,255,0.9)':'rgba(0,0,0,0.85)'}`,
          pointerEvents:'none',zIndex:6}}/>
      )}
      {/* Shuffle button — bubble mode only */}
      {layout==='bubbles'&&(
        <button onClick={()=>shuffleRef.current&&shuffleRef.current()} style={{
          position:'absolute',bottom:8,right:PAD.right+4,zIndex:8,
          fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:'0.04em',
          padding:'4px 10px',border:`1px solid ${t.border}`,borderRadius:4,
          background:t.surface,color:t.muted,cursor:'pointer',
          transition:'all 0.15s',
        }}
        onMouseEnter={e=>{e.target.style.color=t.text;e.target.style.borderColor=t.text}}
        onMouseLeave={e=>{e.target.style.color=t.muted;e.target.style.borderColor=t.border}}
        >⇄ shuffle</button>
      )}
      <div ref={tooltipRef} style={{display:'none',position:'absolute',pointerEvents:'none',
        background:t.tooltip.bg,border:`1px solid ${t.tooltip.border}`,borderRadius:6,
        padding:'8px 12px',fontSize:11,fontFamily:"'DM Mono',monospace",
        color:t.tooltip.text,lineHeight:1.6,whiteSpace:'nowrap',zIndex:10}}/>
    </div>
  )
}


// ── ManifestoView ─────────────────────────────────────────────────────────────
const MANIFESTO_LINES=[
  'THE GRID IS',
  'ALIVE.',
  '',
  'EVERY WATT',
  'EVERY MOMENT',
  'COUNTED.',
  '',
  'COAL FADES.',
  'WIND RISES.',
  'SUN FILLS',
  'THE GAPS.',
  '',
  'WE MADE THIS',
  'TO SEE IT.',
  'CLEARLY.',
  '',
  'GRID PAPER.',
]

const HOVER_PINK='#ff2d78'

function buildLineCells(line,cols,startC,startR,pixW,pixH){
  const cells=[]
  const chars=line.toUpperCase().split('')
  const charW=pixW*6
  chars.forEach((ch,ci)=>{
    const glyph=FONT5[ch]||FONT5[' ']
    const charStartC=startC+ci*charW
    glyph.forEach((row,ry)=>{
      for(let bx=0;bx<5;bx++){
        if(!(row>>(4-bx)&1))continue
        for(let pc=0;pc<pixW;pc++)for(let pr=0;pr<pixH;pr++){
          const c=charStartC+bx*pixW+pc
          const r=startR+ry*pixH+pr
          if(c>=0&&c<cols)cells.push({c,r})
        }
      }
    })
  })
  return cells
}

function ManifestoView({theme:t,dark}){
  const outerRef=useRef(null)
  const canvasRef=useRef(null)
  const[size,setSize]=useState({w:0,h:0})
  const[hoveredLine,setHoveredLine]=useState(null)
  const hitRef=useRef([])

  useEffect(()=>{
    const el=outerRef.current;if(!el)return
    const ro=new ResizeObserver(([e])=>setSize({w:e.contentRect.width,h:e.contentRect.height}))
    ro.observe(el);setSize({w:el.clientWidth,h:el.clientHeight});return()=>ro.disconnect()
  },[])

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!size.w||!size.h)return
    const cols=RAW_DAYS,rows=RAW_SLOTS
    const plotW=size.w-PAD.left-PAD.right
    const plotH=size.h-PAD.top-PAD.bottom
    const cellW=plotW/cols
    const cellH=plotH/rows

    // pixW: fit widest line in ~88% of cols
    const longestLine=Math.max(...MANIFESTO_LINES.filter(Boolean).map(l=>l.length))
    const pixW=Math.max(1,Math.floor(cols*0.88/(6*longestLine-1)))
    // pixH: make font pixels visually square on screen
    const pixH=Math.max(1,Math.round(pixW*cellW/cellH))
    const lineHRows=7*pixH+Math.max(2,pixH*2)

    // Split non-empty lines into pages that fit in rows
    const linesPerPage=Math.max(1,Math.floor(rows*0.78/lineHRows))
    const nonEmpty=MANIFESTO_LINES.map((l,i)=>({l,i})).filter(x=>x.l)
    const pages=[]
    for(let p=0;p<nonEmpty.length;p+=linesPerPage)
      pages.push(nonEmpty.slice(p,p+linesPerPage))

    const totalH=pages.length*size.h
    canvas.width=size.w;canvas.height=totalH
    const ctx=canvas.getContext('2d')
    ctx.fillStyle=t.canvas;ctx.fillRect(0,0,size.w,totalH)

    const hits=[]

    pages.forEach((group,pi)=>{
      const pageTop=pi*size.h
      ctx.fillStyle=t.canvasBg
      ctx.fillRect(PAD.left,pageTop+PAD.top,plotW,plotH)

      // Grid lines
      ctx.strokeStyle=dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.06)'
      ctx.lineWidth=0.5;ctx.beginPath()
      for(let c=0;c<=cols;c++){
        const x=PAD.left+c*cellW
        ctx.moveTo(x,pageTop+PAD.top);ctx.lineTo(x,pageTop+PAD.top+plotH)
      }
      for(let r=0;r<=rows;r++){
        const y=pageTop+PAD.top+r*cellH
        ctx.moveTo(PAD.left,y);ctx.lineTo(PAD.left+plotW,y)
      }
      ctx.stroke()

      const totalLinesH=group.length*lineHRows-(lineHRows-7*pixH)
      const startRow=Math.floor((rows-totalLinesH)/2)

      group.forEach(({l,i},gi)=>{
        const lineRow=startRow+gi*lineHRows
        const lineW=(l.length*6-1)*pixW
        const startC=Math.floor((cols-lineW)/2)
        const y0=pageTop+PAD.top+lineRow*cellH
        const y1=y0+7*pixH*cellH
        hits.push({lineIdx:i,y0,y1})
        const cells=buildLineCells(l,cols,startC,lineRow,pixW,pixH)
        ctx.fillStyle=i===hoveredLine?HOVER_PINK:'#000000'
        cells.forEach(({c,r})=>{
          ctx.fillRect(PAD.left+c*cellW,pageTop+PAD.top+r*cellH,Math.ceil(cellW)+0.3,Math.ceil(cellH)+0.3)
        })
      })

      ctx.strokeStyle=dark?t.border:'#000000';ctx.lineWidth=1
      ctx.strokeRect(PAD.left,pageTop+PAD.top,plotW,plotH)
    })

    hitRef.current=hits
  },[size,hoveredLine,t,dark])

  const handleMouseMove=useCallback(e=>{
    const canvas=canvasRef.current;if(!canvas)return
    const rect=canvas.getBoundingClientRect()
    const scrollY=outerRef.current?outerRef.current.scrollTop:0
    const absY=e.clientY-rect.top+scrollY
    let found=null
    hitRef.current.forEach(({lineIdx,y0,y1})=>{if(absY>=y0&&absY<=y1)found=lineIdx})
    setHoveredLine(found)
  },[])

  const handleMouseLeave=useCallback(()=>setHoveredLine(null),[])

  return(
    <div ref={outerRef} style={{width:'100%',height:'100%',overflowY:'auto',overflowX:'hidden'}}>
      <canvas ref={canvasRef}
        style={{display:'block',width:'100%',cursor:'crosshair'}}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      />
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
const REGIONS=[{code:'NEM',label:'NEM'},{code:'NSW1',label:'NSW'},{code:'VIC1',label:'VIC'},{code:'QLD1',label:'QLD'},{code:'SA1',label:'SA'},{code:'TAS1',label:'TAS'}]
const METRICS=[
  {value:'renewables',label:'Renewables %',      shortLabel:'renewables'},
  {value:'solar',     label:'Solar proportion',  shortLabel:'solar'},
  {value:'wind',      label:'Wind proportion',   shortLabel:'wind'},
  {value:'gas',       label:'Gas proportion',    shortLabel:'gas'},
  {value:'coal',      label:'Coal proportion',   shortLabel:'coal'},
  {value:'carbon',    label:'Carbon intensity',  shortLabel:'carbon'},
  {value:'battery',   label:'Battery dispatch',  shortLabel:'battery'},
]
const GRANULARITIES=[{value:'30min',label:'30 min'},{value:'hourly',label:'Hourly'},{value:'daily',label:'Daily'},{value:'weekly',label:'Weekly'}]

// ── Year River ────────────────────────────────────────────────────────────────
function hexToRgb(hex){
  return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]
}
function paletteColor(palette,v100){
  for(const[thr,hex]of palette)if(v100<=thr)return hexToRgb(hex)
  return hexToRgb(palette[palette.length-1][1])
}

const NEM_TREND={2010:19,2011:18,2012:18,2013:17,2014:18,2015:19,2016:21,2017:22,2018:24,2019:27,2020:29,2021:30,2022:35,2023:38,2024:41,2025:44,2026:46}

function drawPixelText(img,text,imgW,imgH,sx,sy){
  const chars=text.toUpperCase().split('')
  const charW=5,gap=1,totalW=chars.length*(charW+gap)-gap
  const ox=Math.floor((imgW-totalW*sx)/2)
  const oy=imgH-7*sy-2
  chars.forEach((ch,ci)=>{
    const glyph=FONT5[ch]||FONT5[' ']
    glyph.forEach((row,ry)=>{
      for(let bx=0;bx<5;bx++){
        if(!(row>>(4-bx)&1))continue
        for(let pr=0;pr<sy;pr++)for(let pc=0;pc<sx;pc++){
          const px=ox+ci*(charW+gap)*sx+bx*sx+pc
          const py=oy+ry*sy+pr
          if(px<0||px>=imgW||py<0||py>=imgH)continue
          const i=(py*imgW+px)*4
          img.data[i]=255;img.data[i+1]=255;img.data[i+2]=255;img.data[i+3]=200
        }
      }
    })
  })
}

function YearThumb({year,selected,onClick,metric,region,realCacheRef,dark,thumbW,thumbH}){
  const canvasRef=useRef(null)
  const palette=PIXEL_PALETTES_LIGHT[metric]||PIXEL_PALETTES_LIGHT.renewables
  const trend=NEM_TREND[year]
  const label=trend!=null?`${trend}%`:''
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return
    const ctx=canvas.getContext('2d')
    const cacheKey=`real-${region}-${year}`
    const grids=realCacheRef?.current?.[cacheKey]||generateSimData(region,365,48,year)
    const grid=grids[metric]||grids.renewables
    const DAYS=365,SLOTS=48
    const dPerCol=DAYS/thumbW,sPerRow=SLOTS/thumbH
    const img=ctx.createImageData(thumbW,thumbH)
    for(let px=0;px<thumbW;px++){
      for(let py=0;py<thumbH;py++){
        const d0=Math.floor(px*dPerCol),d1=Math.ceil((px+1)*dPerCol)
        const s0=Math.floor(py*sPerRow),s1=Math.ceil((py+1)*sPerRow)
        let sum=0,cnt=0
        for(let d=d0;d<d1&&d<DAYS;d++)for(let s=s0;s<s1&&s<SLOTS;s++){
          const v=grid[d*SLOTS+s];if(v>=0){sum+=v;cnt++}
        }
        const avg=cnt>0?sum/cnt:0
        const[r,g,b]=paletteColor(palette,avg)
        const i=(py*thumbW+px)*4
        img.data[i]=r;img.data[i+1]=g;img.data[i+2]=b;img.data[i+3]=255
      }
    }
    ctx.putImageData(img,0,0)
    if(year===NOW.year){
      ctx.fillStyle='rgba(255,255,255,0.7)'
      ctx.fillRect(Math.round((NOW.doy/365)*thumbW),0,1,thumbH)
    }
  },[year,metric,region,palette,thumbW,thumbH])
  return(
    <div onClick={onClick} title={String(year)}
      style={{cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,flexShrink:0}}>
      <div style={{
        outline:'1px solid #000000',
        outlineOffset:0,
        boxShadow:selected?'0 2px 0 0 #000000':'none',
        transition:'box-shadow 0.12s',
      }}>
        <canvas ref={canvasRef} width={thumbW} height={thumbH} style={{display:'block'}}/>
      </div>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:'0.02em',
        color:selected?'#000000':'rgba(0,0,0,0.35)',
        fontWeight:selected?600:400,transition:'color 0.12s'}}>{year}</span>
    </div>
  )
}

function YearRiver({years,selectedYear,onSelect,metric,region,realCacheRef,dark,theme:t}){
  const THUMB_W=68,THUMB_H=32
  return(
    <div style={{
      display:'flex',alignItems:'flex-end',gap:0,
      padding:'8px 20px 8px',
      flexShrink:0,
      background:'#ffffff',
      justifyContent:'center',
    }}>
      {years.map(y=>(
        <YearThumb key={y} year={y} selected={y===selectedYear}
          onClick={()=>onSelect(y)} metric={metric} region={region}
          realCacheRef={realCacheRef} dark={dark}
          thumbW={THUMB_W} thumbH={THUMB_H}/>
      ))}
    </div>
  )
}
const YEARS=Array.from({length:NOW.year-2009},(_,i)=>2010+i)

export default function App(){
  const[region,setRegion]=useState('NEM')
  const[metric,setMetric]=useState('renewables')
  const[viewMode,setViewMode]=useState('energy')  // 'energy' | 'facility'
  const[facilityLayout,setFacilityLayout]=useState('horizontal') // 'horizontal' | 'treemap'
  const[dark,setDark]=useState(false)
  const[dotMode,setDotMode]=useState(false)
  const[pixelMode,setPixelMode]=useState(false)
  const[watermarkMode,setWatermarkMode]=useState(false)
  const[spritesMode,setSpritesMode]=useState(false)
  const[numBands,setNumBands]=useState(null) // null = smooth
  const[goo,setGoo]=useState(0)
  const[year,setYear]=useState(NOW.year)
  const[yearType,setYearType]=useState('CY')
  const[granularity,setGranularity]=useState('30min')
  const[rawGrids,setRawGrids]=useState(null)
  const[dataMode,setDataMode]=useState('sim') // 'sim'|'loading'|'real'|'error'
  const cache=useRef({})
  const realCache=useRef({})
  const fetchAbort=useRef(null)

  const getCYGrids=(r,y)=>{
    const key=`${r}-${y}`
    if(!cache.current[key]){
      const isCurrent=y===NOW.year
      cache.current[key]=generateSimData(r,isCurrent?NOW.doy:365,isCurrent?NOW.slot:48,y)
    }
    return cache.current[key]
  }
  const getFYGrids=(r,y)=>{
    const key=`FY-${r}-${y}`
    if(!cache.current[key])cache.current[key]=buildFYGrids(getCYGrids(r,y-1),getCYGrids(r,y))
    return cache.current[key]
  }
  const getGrids=(r,y,yt=yearType)=>yt==='FY'?getFYGrids(r,y):getCYGrids(r,y)

  // ── Real data fetch ──────────────────────────────────────────────────────────
  const RENEW_FT=new Set(['solar','wind','hydro','pumps','battery_discharging','bioenergy','battery'])
  const SOLAR_FT=new Set(['solar'])
  const WIND_FT=new Set(['wind'])
  const GAS_FT=new Set(['gas'])
  const COAL_FT=new Set(['coal'])
  const BATT_FT=new Set(['battery_discharging','battery'])
  const FOSSIL_FT=new Set(['gas','coal','distillate'])

  const fetchRealCYGrids=async(r,y,signal)=>{
    const key=`real-${r}-${y}`
    if(realCache.current[key])return realCache.current[key]
    const isLeap=new Date(y,1,29).getMonth()===1
    const DAYS=isLeap?366:365,SLOTS=48
    const yearStartUTC=Date.UTC(y,0,1)
    const tot=new Float64Array(DAYS*SLOTS),ren=new Float64Array(DAYS*SLOTS)
    const sol=new Float64Array(DAYS*SLOTS),wnd=new Float64Array(DAYS*SLOTS)
    const gas=new Float64Array(DAYS*SLOTS),coa=new Float64Array(DAYS*SLOTS)
    const bat=new Float64Array(DAYS*SLOTS),fos=new Float64Array(DAYS*SLOTS)
    const maxMonth=y===NOW.year?NOW.month:12
    for(let m=1;m<=maxMonth;m++){
      const pad=n=>String(n).padStart(2,'0')
      const isCurrentMonth=(y===NOW.year&&m===NOW.month)
      const days=isCurrentMonth?NOW.day:new Date(y,m,0).getDate()
      const params=new URLSearchParams({
        metrics:'energy',interval:'1h',
        date_start:`${y}-${pad(m)}-01T00:00:00`,
        date_end:`${y}-${pad(m)}-${pad(days)}T23:00:00`,
        primary_grouping:'network_region',
        secondary_grouping:'fueltech_group',
        primary_grouping:'network_region',
        secondary_grouping:'fueltech_group',
      })
      const resp=await fetch(`/api/data/network/NEM?${params}`,{signal})
      if(!resp.ok)throw new Error(`HTTP ${resp.status}`)
      const json=await resp.json()
      for(const series of json.data||[]){
        for(const result of series.results||[]){
          const ft=(result.columns?.fueltech_group||'').toLowerCase()
          const rgn=result.columns?.region||result.columns?.network_region||''
          if(r!=='NEM'&&rgn!==r)continue
          for(const[ts,val]of result.data||[]){
            if(typeof val!=='number'||val<=0)continue
            const yr=parseInt(ts.slice(0,4)),mo=parseInt(ts.slice(5,7))-1,dy=parseInt(ts.slice(8,10)),hr=parseInt(ts.slice(11,13))
            const doy=Math.floor((Date.UTC(yr,mo,dy)-yearStartUTC)/86400000)
            if(doy<0||doy>=DAYS)continue
            for(let s=0;s<2;s++){
              const idx=doy*SLOTS+hr*2+s
              tot[idx]+=val
              if(RENEW_FT.has(ft))ren[idx]+=val
              if(SOLAR_FT.has(ft))sol[idx]+=val
              if(WIND_FT.has(ft))wnd[idx]+=val
              if(GAS_FT.has(ft))gas[idx]+=val
              if(COAL_FT.has(ft))coa[idx]+=val
              if(BATT_FT.has(ft))bat[idx]+=val
              if(FOSSIL_FT.has(ft))fos[idx]+=val
            }
          }
        }
      }
    }
    const grids={
      renewables:new Float32Array(DAYS*SLOTS).fill(-1),
      solar:new Float32Array(DAYS*SLOTS).fill(-1),
      wind:new Float32Array(DAYS*SLOTS).fill(-1),
      gas:new Float32Array(DAYS*SLOTS).fill(-1),
      coal:new Float32Array(DAYS*SLOTS).fill(-1),
      carbon:new Float32Array(DAYS*SLOTS).fill(-1),
      battery:new Float32Array(DAYS*SLOTS).fill(-1),
    }
    const maxDay=y===NOW.year?NOW.doy:DAYS
    for(let d=0;d<maxDay;d++){
      const slotLim=(d===maxDay-1&&y===NOW.year)?NOW.slot:SLOTS
      for(let s=0;s<slotLim;s++){
        const idx=d*SLOTS+s
        const t=tot[idx];if(t<=0)continue
        grids.renewables[idx]=(ren[idx]/t)*100
        grids.solar[idx]=(sol[idx]/t)*100
        grids.wind[idx]=(wnd[idx]/t)*100
        grids.gas[idx]=(gas[idx]/t)*100
        grids.coal[idx]=(coa[idx]/t)*100
        grids.battery[idx]=(bat[idx]/t)*100
        grids.carbon[idx]=(fos[idx]/t)*800
      }
    }
    realCache.current[key]=grids
    return grids
  }

  const triggerRealFetch=async(r,y,yt)=>{
    if(fetchAbort.current)fetchAbort.current.abort()
    fetchAbort.current=new AbortController()
    const{signal}=fetchAbort.current
    setDataMode('loading')
    try{
      let grids
      if(yt==='FY'){
        const[prev,cur]=await Promise.all([
          fetchRealCYGrids(r,y-1,signal),
          fetchRealCYGrids(r,y,signal),
        ])
        const key=`real-FY-${r}-${y}`
        if(!realCache.current[key])realCache.current[key]=buildFYGrids(prev,cur)
        grids=realCache.current[key]
      }else{
        grids=await fetchRealCYGrids(r,y,signal)
      }
      setRawGrids(grids)
      setDataMode('real')
    }catch(e){
      if(e.name==='AbortError')return
      console.warn('Real data fetch failed, keeping sim:',e.message)
      setDataMode('error')
    }
  }

  useEffect(()=>{
    const link=document.createElement('link')
    link.rel='stylesheet'
    link.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Archivo+Black&display=swap'
    document.head.appendChild(link)
    // Show sim data immediately, then fetch real
    setRawGrids(getGrids('NEM',NOW.year,'CY'))
    triggerRealFetch('NEM',NOW.year,'CY')
  },[])

  const handleRegion=(r)=>{setRegion(r);setRawGrids(getGrids(r,year));triggerRealFetch(r,year,yearType)}
  const handleYear=(y)=>{setYear(y);setRawGrids(getGrids(region,y));triggerRealFetch(region,y,yearType)}
  const handleYearType=(yt)=>{setYearType(yt);setRawGrids(getGrids(region,year,yt));triggerRealFetch(region,year,yt)}
  const handleYearKey=k=>{
    const parts=k.split('-')
    const yt=parts[0]
    const y=Number(parts[1])
    setYear(y);setYearType(yt);setRawGrids(getGrids(region,y,yt))
    triggerRealFetch(region,y,yt)
  }
  const handleGranularity=(g)=>{setGranularity(g)}

  const t=dark?themes.dark:themes.light
  const btn=(active)=>({fontFamily:"'DM Mono',monospace",fontSize:11,padding:'5px 11px',border:'none',borderRadius:4,cursor:'pointer',transition:'all 0.15s',background:active?(dark?'#2a2d30':'#ddd9d0'):'transparent',color:active?t.text:t.muted,fontWeight:active?500:400})

  const Dropdown=({value,onChange,options})=>(
    <div style={{position:'relative',display:'flex',alignItems:'center'}}>
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{fontFamily:"'DM Mono',monospace",fontSize:11,padding:'6px 32px 6px 12px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,color:t.text,height:32}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{position:'absolute',right:10,pointerEvents:'none',color:t.muted,fontSize:10}}>▾</span>
    </div>
  )

  const yearKey=`${yearType}-${year}`
  const yearOptions=[
    ...YEARS.slice().reverse().map(y=>({value:`CY-${y}`,label:String(y)})),
    ...YEARS.filter(y=>y>2010).slice().reverse().map(y=>({value:`FY-${y}`,label:`FY${y}`})),
  ]

  // ── Responsive ──────────────────────────────────────────────────────────────
  const[winW,setWinW]=useState(typeof window!=='undefined'?window.innerWidth:1200)
  const[drawerOpen,setDrawerOpen]=useState(false)
  useEffect(()=>{
    const fn=()=>setWinW(window.innerWidth)
    window.addEventListener('resize',fn)
    return()=>window.removeEventListener('resize',fn)
  },[])
  const isMobile=winW<768
  useEffect(()=>{if(viewMode==='manifesto')setDrawerOpen(false)},[viewMode])

  // ── Reusable sub-components (defined inline so they close over state) ──────
  const RegionToggle=()=>(
    <div style={{display:'flex',gap:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,padding:3}}>
      {REGIONS.map(r=><button key={r.code} onClick={()=>handleRegion(r.code)}
        style={{...btn(region===r.code),padding:'4px 10px',fontSize:11}}>{r.label}</button>)}
    </div>
  )
  const FACILITY_LAYOUTS=[
    {v:'horizontal', icon:(
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="2" width="12" height="2.5" rx="0.5" fill="currentColor"/>
        <rect x="1" y="5.75" width="12" height="2.5" rx="0.5" fill="currentColor"/>
        <rect x="1" y="9.5" width="12" height="2.5" rx="0.5" fill="currentColor"/>
      </svg>
    )},
    {v:'treemap', icon:(
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="7" height="7" rx="0.5" fill="currentColor"/>
        <rect x="9.5" y="1" width="3.5" height="3.5" rx="0.5" fill="currentColor"/>
        <rect x="9.5" y="5.5" width="3.5" height="2.5" rx="0.5" fill="currentColor"/>
        <rect x="1" y="9.5" width="4" height="3.5" rx="0.5" fill="currentColor"/>
        <rect x="6" y="9.5" width="7" height="3.5" rx="0.5" fill="currentColor"/>
      </svg>
    )},
    {v:'bubbles', icon:(
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="5" cy="5.5" r="4" fill="currentColor"/>
        <circle cx="10.5" cy="9" r="2.5" fill="currentColor"/>
        <circle cx="10" cy="3.5" r="1.5" fill="currentColor"/>
      </svg>
    )},
  ]
  const FacilityLayoutToggle=()=>(
    <div style={{display:'flex',gap:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,padding:3}}>
      {FACILITY_LAYOUTS.map(({v,icon})=>(
        <button key={v} onClick={()=>setFacilityLayout(v)} title={v}
          style={{...btn(facilityLayout===v),padding:'4px 8px',borderRadius:3,
            display:'flex',alignItems:'center',justifyContent:'center',lineHeight:0}}>
          {icon}
        </button>
      ))}
    </div>
  )
  const MetricToggle=()=>(
    <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
      {METRICS.map(m=>(
        <button key={m.value} onClick={()=>setMetric(m.value)}
          style={{...btn(metric===m.value),padding:'5px 11px',fontSize:11,borderRadius:4,
            border:`1px solid ${metric===m.value?t.border:'transparent'}`,
            background:metric===m.value?(dark?'#2a2d30':'#ddd9d0'):'transparent'}}>
          {m.shortLabel||m.label}
        </button>
      ))}
    </div>
  )
  const TimeControls=()=>(
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <Dropdown value={granularity} onChange={handleGranularity} options={GRANULARITIES}/>
      <Dropdown value={yearKey} onChange={handleYearKey} options={yearOptions}/>
    </div>
  )
  const DisplayControls=()=>(
    <div style={{display:'flex',gap:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,padding:3}}>
      {[{v:false,icon:'▬▬'},{v:true,icon:'••'}].map(({v,icon})=>(
        <button key={String(v)} onClick={()=>setDotMode(v)}
          style={{...btn(dotMode===v),padding:'4px 9px',fontSize:11,letterSpacing:2,borderRadius:3}}>{icon}</button>
      ))}
    </div>
  )
  const RecordsBtn=()=>(
    <button onClick={()=>setSpritesMode(s=>!s)}
      style={{height:32,padding:'0 12px',border:`1px solid ${spritesMode?'#ff2d78':t.border}`,borderRadius:6,
        background:spritesMode?'rgba(255,45,120,0.08)':t.surface,cursor:'pointer',
        fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:'0.03em',
        color:spritesMode?'#ff2d78':t.muted,transition:'all 0.15s'}}>
      records
    </button>
  )
  const DarkBtn=()=>(
    <button onClick={()=>setDark(d=>!d)} style={{width:32,height:32,border:`1px solid ${t.border}`,borderRadius:6,
      background:t.surface,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
      fontSize:14,color:t.text,flexShrink:0}}>{dark?'☀':'☽'}</button>
  )
  const AboutBtn=()=>(
    <button onClick={()=>setViewMode(v=>v==='manifesto'?'energy':'manifesto')}
      style={{height:32,padding:'0 12px',border:`1px solid ${viewMode==='manifesto'?t.text:t.border}`,borderRadius:6,
        background:'transparent',cursor:'pointer',fontFamily:"'DM Mono',monospace",fontSize:11,
        color:viewMode==='manifesto'?t.text:t.muted,letterSpacing:'0.04em',flexShrink:0,transition:'all 0.15s'}}>
      about
    </button>
  )
  const DrawerSection=({label,children})=>(
    <div style={{paddingBottom:22}}>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:'0.12em',
        textTransform:'uppercase',color:t.muted,marginBottom:10,opacity:0.6}}>{label}</div>
      {children}
    </div>
  )

  return(
    <div style={{background:t.bg,height:'100vh',color:t.text,fontFamily:"'DM Sans',sans-serif",
      transition:'background 0.3s,color 0.3s',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        *{box-sizing:border-box;margin:0;padding:0}
        button{outline:none}
        select{outline:none;appearance:none;-webkit-appearance:none;cursor:pointer}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>

      {/* ── DESKTOP bar ── */}
      {!isMobile&&(
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px 10px 24px',flexShrink:0,borderBottom:`1px solid ${t.border}`}}>
        <div style={{fontFamily:"'Archivo Black','Arial Black',sans-serif",fontSize:22,fontWeight:900,
          letterSpacing:'0.08em',lineHeight:1,color:t.text,textTransform:'uppercase',marginRight:10,flexShrink:0}}>
          Grid Paper
        </div>
        {/* View toggle */}
        <div style={{display:'flex',gap:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,padding:3,flexShrink:0}}>
          {[{v:'energy',label:'energy'},{v:'facility',label:'facilities'}].map(({v,label})=>(
            <button key={v} onClick={()=>setViewMode(v)}
              style={{...btn(viewMode===v),padding:'4px 12px',fontSize:11,letterSpacing:'0.02em',borderRadius:3}}>{label}</button>
          ))}
        </div>
        {/* Facility layout — separate, icon-only */}
        <RegionToggle/>
        {viewMode==='energy'&&(
          <div style={{display:'flex',gap:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,padding:3,flexShrink:0}}>
            {METRICS.map(m=>(
              <button key={m.value} onClick={()=>setMetric(m.value)}
                style={{...btn(metric===m.value),padding:'4px 10px',fontSize:11,letterSpacing:'0.01em',borderRadius:3}}>
                {m.shortLabel||m.label}
              </button>
            ))}
          </div>
        )}
        <div style={{flex:1}}/>
        {/* Data mode badge */}
        <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
          <div style={{
            width:6,height:6,borderRadius:'50%',flexShrink:0,
            background:dataMode==='real'?'#22c55e':dataMode==='loading'?'#f59e0b':dataMode==='error'?'#ef4444':'#6b7280',
            boxShadow:dataMode==='loading'?'0 0 6px #f59e0b':dataMode==='real'?'0 0 6px #22c55e':'none',
            animation:dataMode==='loading'?'pulse 1s infinite':'none',
          }}/>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:'0.1em',
            color:dataMode==='real'?'#22c55e':dataMode==='loading'?'#f59e0b':t.muted,
            textTransform:'uppercase',flexShrink:0}}>
            {dataMode==='real'?'live':dataMode==='loading'?'fetching…':dataMode==='error'?'sim':'sim'}
          </span>
        </div>
        {viewMode==='energy'&&<RecordsBtn/>}
        {viewMode==='energy'&&<Dropdown value={granularity} onChange={handleGranularity} options={GRANULARITIES}/>}
        <Dropdown value={yearKey} onChange={handleYearKey} options={yearOptions}/>
        {viewMode==='energy'&&<DisplayControls/>}
        {viewMode==='facility'&&<FacilityLayoutToggle/>}
        <DarkBtn/>
        <AboutBtn/>
      </div>
      )}

      {/* ── MOBILE bar ── */}
      {isMobile&&(
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',flexShrink:0,borderBottom:`1px solid ${t.border}`}}>
        <div style={{fontFamily:"'Archivo Black','Arial Black',sans-serif",fontSize:18,fontWeight:900,
          letterSpacing:'0.08em',lineHeight:1,color:t.text,textTransform:'uppercase',flex:1}}>
          Grid Paper
        </div>
        <DarkBtn/>
        <AboutBtn/>
        {viewMode!=='manifesto'&&(
          <button onClick={()=>setDrawerOpen(o=>!o)}
            style={{width:34,height:34,border:`1px solid ${drawerOpen?t.text:t.border}`,borderRadius:6,
              background:drawerOpen?t.surface:'transparent',cursor:'pointer',
              display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4.5,flexShrink:0}}>
            <div style={{width:15,height:1.5,background:t.text,borderRadius:1}}/>
            <div style={{width:11,height:1.5,background:t.text,borderRadius:1,marginLeft:-4}}/>
            <div style={{width:15,height:1.5,background:t.text,borderRadius:1}}/>
          </button>
        )}
      </div>
      )}

      {/* ── MOBILE drawer ── */}
      {isMobile&&<>
        {drawerOpen&&(
          <div onClick={()=>setDrawerOpen(false)}
            style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:40}}/>
        )}
        <div style={{
          position:'fixed',bottom:0,left:0,right:0,zIndex:50,
          background:t.bg,borderTop:`1px solid ${t.border}`,
          borderRadius:'14px 14px 0 0',padding:'0 20px env(safe-area-inset-bottom,16px)',
          maxHeight:'78vh',overflowY:'auto',
          transform:drawerOpen?'translateY(0)':'translateY(100%)',
          transition:'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
          boxShadow:'0 -12px 48px rgba(0,0,0,0.14)',
        }}>
          {/* Handle */}
          <div style={{display:'flex',justifyContent:'center',padding:'12px 0 18px'}}>
            <div style={{width:34,height:4,borderRadius:2,background:t.border}}/>
          </div>

          <DrawerSection label="view">
            <div style={{display:'flex',gap:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,padding:3}}>
              {[{v:'energy',label:'energy'},{v:'facility',label:'facilities'}].map(({v,label})=>(
                <button key={v} onClick={()=>{setViewMode(v)}}
                  style={{...btn(viewMode===v),padding:'6px 16px',fontSize:12,letterSpacing:'0.02em',borderRadius:3}}>{label}</button>
              ))}
            </div>
          </DrawerSection>

          {viewMode==='facility'&&<DrawerSection label="layout">
            <FacilityLayoutToggle/>
          </DrawerSection>}

          <DrawerSection label="region">
            <RegionToggle/>
          </DrawerSection>

          {viewMode==='energy'&&<DrawerSection label="metric">
            <MetricToggle/>
          </DrawerSection>}

          {viewMode==='energy'&&<DrawerSection label="time">
            <TimeControls/>
          </DrawerSection>}

          {viewMode==='energy'&&<DrawerSection label="display">
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <DisplayControls/>
              <RecordsBtn/>
            </div>
          </DrawerSection>}
        </div>
      </>}

      {/* ── Main content ── */}
      <div style={{flex:1,padding:'0 20px 0 0',minHeight:0,overflow:'hidden',position:'relative'}}>
        {viewMode==='manifesto'
          ?<ManifestoView theme={t} dark={dark}/>
          :viewMode==='facility'
          ?<FacilityGrid region={region} theme={t} dark={dark} layout={facilityLayout}/>
          :(rawGrids
            ?<Heatmap rawGrids={rawGrids} metric={metric} year={year} theme={t} dark={dark} dotMode={dotMode} goo={goo} watermarkMode={false} spritesMode={spritesMode} numBands={numBands} onNumBandsChange={setNumBands}
                granularity={granularity} yearType={yearType}/>
            :<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Mono',monospace",fontSize:13,color:t.muted}}>Loading…</div>
          )
        }
        {/* Context summary */}
        {viewMode==='energy'&&(()=>{
          const regionLabel=REGIONS.find(r=>r.code===region)?.label||region
          const regionFull={NEM:'National Grid',NSW:'New South Wales',VIC:'Victoria',QLD:'Queensland',SA:'South Australia',TAS:'Tasmania'}[regionLabel]||regionLabel
          const metricLabel=METRICS.find(m=>m.value===metric)?.label||metric
          const granLabel=GRANULARITIES.find(g=>g.value===granularity)?.label||granularity
          const yearLabel=yearType==='FY'?`FY${year}`:String(year)
          return(
            <div style={{position:'absolute',bottom:16,left:46,display:'flex',alignItems:'center',gap:5,pointerEvents:'none',lineHeight:1}}>
              {[metricLabel,regionFull,yearLabel,granLabel].map((p,i)=>(
                <span key={i} style={{display:'inline-flex',alignItems:'center',gap:5,fontFamily:"'DM Mono',monospace",fontSize:10}}>
                  <span style={{color:i===0?t.text:t.muted,fontWeight:i===0?500:400,opacity:i===0?1:0.65}}>{p}</span>
                  {i<3&&<span style={{color:t.muted,opacity:0.3}}>·</span>}
                </span>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Year River */}
      {!isMobile&&viewMode==='energy'&&(
        <YearRiver years={YEARS} selectedYear={year} onSelect={y=>handleYear(y)}
          metric={metric} region={region} realCacheRef={realCache} dark={dark} theme={t}/>
      )}

      {/* Footer */}
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:t.muted,padding:'5px 24px',borderTop:`1px solid ${t.border}`,display:'flex',justifyContent:'flex-end',alignItems:'center',flexShrink:0}}>
        <span style={{opacity:0.4}}>NEM data via Open Electricity (CC BY-NC 4.0)</span>
      </div>
    </div>
  )
}
