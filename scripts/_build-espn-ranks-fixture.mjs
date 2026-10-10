/** One-shot helper: parse pasted article plain text into a ranks fixture. */
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

// Sourced from ESPN story id 48484688 (way-too-early H2H Points, 2026-27).
const ARTICLE_TEXT = `
1. Nikola Jokic, Den, C1 2. Victor Wembanyama, SA, C2 3. Shai Gilgeous-Alexander, OKC, PG1 4. Luka Doncic, LAL, PG2 5. Tyrese Maxey, Phi, PG3 & SG 6. Cade Cunningham, Det, PG4 & SG 7. Giannis Antetokounmpo, Mil, PF1 & C 8. Jalen Johnson, Atl, PF2 9. Donovan Mitchell, Cle, SG1 & PG 10. Anthony Edwards, Min, SG2 & SF 11. Cooper Flagg, Dal, SF1 & PG/PF 12. Jayson Tatum, Bos, PF3 & SF 13. Amen Thompson, Hou, SF2 & SG 14. Scottie Barnes, Tor, SF3 & SG 15. Jamal Murray, Den, PG5 16. Alperen Sengun, Hou, C3 17. Karl-Anthony Towns, NY, C4 & PF 18. Kevin Durant, Hou, PF4 & SF 19. Mikal Bridges, NY, SF4 & SG 20. Tyrese Haliburton, Ind, PG6 & SG 21. James Harden, Cle, PG7 & SG 22. Jaylen Brown, Bos, SF5 & SG 23. Chet Holmgren, OKC, C5 & PF 24. Kawhi Leonard, LAC, SF6 & PF 25. Jalen Duren, Det, C6 26. Evan Mobley, Cle, PF5 & C 27. Deni Avdija, Por, SF7 & SG 28. Devin Booker, Phx, PG8 & SG 29. Pascal Siakam, Ind, PF6 30. Paolo Banchero, Orl, PF7 & SF 31. Trey Murphy III, NO, SF8 & SG 32. Stephon Castle, SA, PG9 & SG 33. Kon Knueppel, Cha, SG3 34. Kyrie Irving, Dal, PG10 & SG 35. Josh Giddey, Chi, SG4 & PG/SF 36. VJ Edgecombe, Phi, SG5 37. Jalen Brunson, NY, PG11 38. Austin Reaves, LAL, SG6 & PG/SF 39. Jalen Williams, OKC, PF8 & SF/C 40. Darius Garland, LAC, PG12 41. Domantas Sabonis, Sac, C7 & PF 42. Keyonte George, Utah, PG13 & SG 43. Anthony Davis, Wsh, C8 & PF 44. Lauri Markkanen, Utah, PF9 & SF 45. LeBron James, LAL, SF9 & PF 46. Paul George, Phi, SF10 & PF 47. Dejounte Murray, NO, SG7 & PG 48. Michael Porter Jr., Bkn, SF11 & PF 49. Matas Buzelis, Chi, SF12 & PF 50. Ja Morant, Mem, PG14 51. Brandon Miller, Cha, SF13 & SG 52. Trae Young, Wsh, PG15 53. Nickeil Alexander-Walker, Atl, SG8 54. Alex Sarr, Wsh, C9 55. Stephen Curry, GS, PG16 56. Zion Williamson, NO, PF10 57. Jaren Jackson Jr., Utah, C10 & PF 58. LaMelo Ball, Cha, PG17 59. Bam Adebayo, Mia, C11 & PF 60. Tyler Herro, Mia, SG9 & PG 61. De'Aaron Fox, SA, PG18 62. Fred VanVleet, Hou, PG19 63. Anthony Black, Orl, PG20 & SG 64. Brandon Ingram, Tor, SF14 65. Saddiq Bey, NO, SF15 & PF 66. Damian Lillard, Por, PG21 67. CJ McCollum, Atl, SG10 & PG 68. Franz Wagner, Orl, SF16 & PF 69. Desmond Bane, Orl, SG11 & SF 70. Nikola Vucevic, Bos, C12 71. Joel Embiid, Phi, C13 72. RJ Barrett, Tor, SF17 & SG 73. Scoot Henderson, Por, PG22 74. Zach Edey, Mem, C14 75. Donovan Clingan, Por, C15 76. Jarrett Allen, Cle, C16 77. Norman Powell, Mia, SG12 & SF 78. Payton Pritchard, Bos, PG23 79. Shaedon Sharpe, Por, SG13 & SF 80. Derik Queen, NO, C17 81. Jalen Green, Phx, SG14 82. Reed Sheppard, Hou, SG15 & PG 83. Andrew Wiggins, Mia, SF18 & PF 84. DeMar DeRozan, Sac, SF19 & PF 85. Rudy Gobert, Min, C18 86. Jrue Holiday, Por, PG24 & SG 87. Derrick White, Bos, SG16 & PG 88. Miles Bridges, Cha, SF20 & PF 89. OG Anunoby, NY, SF21 & PF 90. Ivica Zubac, Ind, C19 91. Julius Randle, Min, PF11 92. Andrew Nembhard, Ind, PG25 & SG 93. Dylan Harper, SA, PG26 & SG 94. Jeremiah Fears, NO, SG17 & PG 95. Josh Hart, NY, SF22 & SG 96. Anfernee Simons, Chi, SG18 & PG 97. Jaden McDaniels, Min, SF23 98. Walker Kessler, Utah, C20 99. Grayson Allen, Phx, SG19 & PG 100. Jalen Suggs, Orl, PG27 & SG 101. Aaron Gordon, Den, PF12 102. Kyshawn George, Wsh, SG20 & SF 103. Jabari Smith Jr., Hou, PF13 & C 104. Ausar Thompson, Det, SF24 & PF 105. Toumani Camara, Por, PF14 & SF 106. Ace Bailey, Utah, SF25 & PF 107. Immanuel Quickley, Tor, PG28 & SG 108. Onyeka Okongwu, Atl, C21 109. Egor Demin, Bkn, PG29 110. Dyson Daniels, Atl, SG21 & PG 111. Deandre Ayton, LAL, C22 112. Myles Turner, Mil, C23 113. Tre Jones, Chi, PG30 114. Neemias Queta, Bos, C24 115. Mark Williams, Phx, C25 116. Ryan Rollins, Mil, SG22 & PG 117. Jakob Poeltl, Tor, C26 118. Kevin Porter Jr., Mil, SG23 & PG 119. P.J. Washington, Dal, PF15 & SF 120. Jaime Jaquez Jr., Mia, SF26 & SG 121. Dillon Brooks, Phx, SF27 & SG 122. Kel'el Ware, Mia, C27 123. Isaiah Collier, Utah, PG31 124. Devin Vassell, SA, SG24 & SF 125. Jerami Grant, Por, PF16 126. Ayo Dosunmu, Min, SG25 127. John Collins, LAC, PF17 & C 128. Kristaps Porzingis, GS, C28 & PF 129. Nic Claxton, Bkn, C29 130. Davion Mitchell, Mia, PG32 131. Brice Sensabaugh, Utah, SF28 132. Bennedict Mathurin, LAC, SF29 & SG 133. Santi Aldama, Mem, PF18 & SF/C 134. Peyton Watson, Den, SF30 & PF 135. Isaiah Hartenstein, OKC, C30 136. Donte DiVincenzo, Min, SG26 & PG 137. Naz Reid, Min, C31 & PF 138. Coby White, Cha, PG33 & SG 139. Bilal Coulibaly, Wsh, SF31 & SG 140. Moussa Diabate, Cha, PF19 & C 141. Dennis Schroder, Cle, PG34 142. Cason Wallace, OKC, SG27 143. Ty Jerome, Mem, PG35 144. Jusuf Nurkic, Utah, C32 145. Kyle Kuzma, Mil, PF20 & SF 146. Collin Sexton, Chi, SG28 & PG 147. Daniel Gafford, Dal, C33 148. Kyle Filipowski, Utah, PF21 & C 149. Naji Marshall, Dal, SF32 & PF 150. Christian Braun, Den, SG29 & SF
`

const guessPositions = (tail) => {
  const text = tail.toUpperCase()
  const found = []
  for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
    if (text.includes(pos)) found.push(pos)
  }
  return found.length ? found : ["SF"]
}

const pattern =
  /(\d{1,3})\.\s+([A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+)+),\s+([A-Za-z]{2,4}),\s*([A-Z0-9/& ]+?)(?=\s+\d{1,3}\.|$)/g

const ranks = []
for (const match of ARTICLE_TEXT.matchAll(pattern)) {
  ranks.push({
    rank: Number(match[1]),
    name: match[2].trim(),
    team: match[3].trim(),
    positions: guessPositions(match[4]),
  })
}

ranks.sort((a, b) => a.rank - b.rank)
console.log("parsed", ranks.length)
console.log(ranks.slice(0, 5))
console.log(ranks.slice(-3))

const outPath = path.resolve(
  process.cwd(),
  "data/players/espn_h2h_points_rankings_2026_27.json",
)
await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(
  outPath,
  `${JSON.stringify(
    {
      meta: {
        source: "espn_story_48484688",
        title:
          "Fantasy basketball: Way-too-early H2H Points league rankings for 2026-27",
        url: "https://www.espn.com/fantasy/basketball/story/_/id/48484688/fantasy-basketball-way-too-early-points-league-rankings-next-season-2026-27",
        capturedAt: new Date().toISOString(),
        count: ranks.length,
      },
      rankings: ranks,
    },
    null,
    2,
  )}\n`,
  "utf8",
)
console.log("wrote", outPath)
