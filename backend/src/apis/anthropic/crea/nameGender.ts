// First-name → grammatical-gender heuristic for Crea's salutation (design doc
// `G` ch. 4). The Gradido account has no gender field, so the code guesses
// "Liebe/Lieber" from a curated list of common (mostly German) first names.
// Names that are genuinely ambiguous (Andrea, Kim, Toni, Sascha, Alex, Chris,
// Simone in IT, …) are DELIBERATELY absent so they fall through to the
// uncertain path (neutral "Liebe," + a flag the moderator resolves, E-005).
//
// Extend freely: add the ASCII-normalised, lower-cased form to the right set.
// Coverage need not be exhaustive — anything unlisted is handled safely by the
// moderator, it just costs one click.

export type NameGender = 'male' | 'female' | null

// Normalise umlauts/ß to ASCII so "Günther" and "Guenther" both match, and to
// keep the data umlaut-free in source (repo convention).
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
}

// biome-ignore format: keep the curated name list compact
const MALE = [
  'thomas', 'michael', 'andreas', 'peter', 'wolfgang', 'klaus', 'juergen', 'guenter', 'guenther',
  'stefan', 'stephan', 'christian', 'uwe', 'werner', 'hans', 'manfred', 'helmut', 'frank', 'bernd',
  'bernhard', 'dieter', 'rolf', 'rainer', 'reiner', 'karl', 'carl', 'heinz', 'horst', 'wilhelm',
  'walter', 'walther', 'kurt', 'herbert', 'georg', 'gerhard', 'rudolf', 'rudi', 'josef', 'joseph',
  'franz', 'otto', 'ernst', 'erwin', 'alfred', 'friedrich', 'fritz', 'paul', 'martin', 'markus',
  'marcus', 'matthias', 'alexander', 'sebastian', 'daniel', 'tobias', 'florian', 'jan', 'jens',
  'dirk', 'sven', 'torsten', 'thorsten', 'ralf', 'ralph', 'holger', 'norbert', 'reinhard', 'volker',
  'lars', 'marco', 'marko', 'oliver', 'kai', 'nico', 'niko', 'patrick', 'philipp', 'philip', 'simon',
  'jonas', 'lukas', 'lucas', 'leon', 'felix', 'maximilian', 'max', 'moritz', 'david', 'julian',
  'benjamin', 'fabian', 'dominik', 'erik', 'erich', 'robert', 'richard', 'roland', 'ulrich', 'udo',
  'detlef', 'harald', 'heiko', 'ingo', 'bruno', 'emil', 'ludwig', 'konrad', 'heinrich', 'wilfried',
  'siegfried', 'gottfried', 'anton', 'johannes', 'johann', 'nils', 'niels', 'malte', 'tim', 'timo',
  'till', 'noah', 'elias', 'ben', 'luis', 'louis', 'theo', 'oskar', 'oscar', 'hannes', 'jakob',
  'jacob', 'vincent', 'mario', 'rene', 'hartmut', 'dietmar', 'joachim', 'jochen', 'eberhard', 'gerd',
  'gert', 'willi', 'willy', 'kevin', 'dennis', 'denis', 'marcel', 'pascal',
]

// biome-ignore format: keep the curated name list compact
const FEMALE = [
  'maria', 'ursula', 'ingrid', 'renate', 'helga', 'gisela', 'elisabeth', 'erika', 'monika', 'christa',
  'gertrud', 'gertrude', 'brigitte', 'hildegard', 'gerda', 'karin', 'ute', 'sabine', 'petra',
  'susanne', 'claudia', 'birgit', 'martina', 'gabriele', 'gabriela', 'heike', 'angelika', 'barbara',
  'christine', 'christina', 'cornelia', 'manuela', 'kerstin', 'katrin', 'kathrin', 'silke', 'anke',
  'nicole', 'tanja', 'melanie', 'stefanie', 'stephanie', 'sandra', 'bettina', 'simone', 'daniela',
  'antje', 'astrid', 'elke', 'doris', 'marion', 'beate', 'anja', 'kirsten', 'bianca', 'julia', 'anna',
  'anne', 'laura', 'lena', 'lisa', 'sarah', 'sara', 'katharina', 'johanna', 'marie', 'sophie', 'sofie',
  'sophia', 'sofia', 'charlotte', 'emma', 'mia', 'hannah', 'hanna', 'lea', 'leonie', 'amelie', 'clara',
  'klara', 'franziska', 'vanessa', 'jasmin', 'jessica', 'nadine', 'verena', 'carina', 'karina',
  'ramona', 'yvonne', 'sonja', 'regina', 'rita', 'rosa', 'rosemarie', 'waltraud', 'irmgard', 'edith',
  'hedwig', 'frieda', 'frida', 'margarete', 'margarethe', 'margret', 'marlene', 'ilse', 'inge',
  'ingeborg', 'irene', 'kaethe', 'lieselotte', 'annegret', 'annette', 'anette', 'baerbel', 'dagmar',
  'heidi', 'heidrun', 'jutta', 'marianne', 'roswitha', 'sieglinde', 'ruth', 'hannelore', 'elfriede',
  'elfi', 'wilma', 'herta', 'hertha', 'magdalena', 'agnes', 'silvia', 'sylvia', 'gudrun', 'greta',
  'mathilde', 'adelheid', 'henriette', 'meike', 'wiebke', 'cordula', 'hella', 'elsa', 'else',
]

const MALE_SET = new Set(MALE)
const FEMALE_SET = new Set(FEMALE)

/**
 * Guesses the grammatical gender of a first name, or `null` when the name is
 * unknown or ambiguous. Uses the first whitespace-separated token, so full
 * names ("Anna Maria") resolve on the leading name.
 */
export function guessGender(firstName: string | null | undefined): NameGender {
  if (!firstName) {
    return null
  }
  const first = normalizeName(firstName).split(/\s+/)[0]
  if (!first) {
    return null
  }
  if (MALE_SET.has(first)) {
    return 'male'
  }
  if (FEMALE_SET.has(first)) {
    return 'female'
  }
  return null
}
