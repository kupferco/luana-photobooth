/**
 * Friendly names for printers.
 *
 * A printer needs a name that identifies the *box*, not its position in a
 * list. "Printer 2 is offline" is useless when two identical black cases sit
 * on the same table, and worse for anyone renting units: a warehouse of
 * boxes labelled 1, 2 and 3 will eventually send two 3s to one venue.
 *
 * So the name comes from the hardware and never changes: generated once,
 * written to the SD card, and claimed centrally so no two units share one.
 * It goes on a sticker, so the thing in the app and the thing on the table
 * are obviously the same thing.
 *
 * Three words, because two collide too often and four is a mouthful. Roughly
 * 60 x 40 x 60 = 144,000 combinations, which for a first birthday party's
 * worth of hardware is more than enough, and the server re-rolls on the rare
 * clash anyway.
 *
 * The words are deliberately party-shaped and harmless. Someone reads this
 * aloud across a room to a person holding a printer.
 */

const CHEERFUL = [
  'merry', 'sunny', 'golden', 'happy', 'jolly', 'bright', 'lucky', 'sparkly',
  'dandy', 'breezy', 'cosy', 'glitter', 'confetti', 'balloon', 'ribbon',
  'party', 'disco', 'rosy', 'velvet', 'twinkle', 'bubbly', 'peachy', 'minty',
  'cherry', 'honey', 'silky', 'plush', 'swirly', 'giddy', 'zesty', 'lively',
  'snazzy', 'jazzy', 'chirpy', 'perky', 'sprightly', 'dapper', 'swanky',
  'cheery', 'bouncy', 'fizzy', 'sugary', 'lemony', 'buttery', 'caramel',
  'copper', 'amber', 'coral', 'lilac', 'scarlet', 'ivory', 'jade', 'ruby',
  'topaz', 'opal', 'pearly', 'starry', 'moonlit', 'sunlit', 'candlelit',
]

const DOING = [
  'dance', 'sing', 'play', 'laugh', 'cheer', 'clap', 'twirl', 'skip',
  'jump', 'wave', 'hug', 'smile', 'toast', 'gather', 'mingle', 'chatter',
  'giggle', 'shuffle', 'sway', 'strut', 'parade', 'bustle', 'flutter',
  'glide', 'hop', 'bop', 'jive', 'boogie', 'waltz', 'samba', 'conga',
  'picnic', 'feast', 'nibble', 'sip', 'share', 'gift', 'wrap', 'unwrap',
  'welcome',
]

const TREATS = [
  'cake', 'mango', 'waffle', 'brownie', 'muffin', 'pancake', 'donut',
  'cookie', 'cupcake', 'pavlova', 'trifle', 'custard', 'jelly', 'sorbet',
  'gelato', 'sundae', 'popcorn', 'pretzel', 'toffee', 'fudge', 'truffle',
  'macaron', 'biscuit', 'crumpet', 'scone', 'pastry', 'strudel', 'eclair',
  'churro', 'brigadeiro', 'coxinha', 'pastel', 'acai', 'papaya', 'guava',
  'lychee', 'peach', 'plum', 'apricot', 'cherry', 'melon', 'lemon',
  'lime', 'coconut', 'banana', 'pineapple', 'grape', 'berry', 'fig',
  'date', 'honeycomb', 'marzipan', 'nougat', 'praline', 'sherbet',
  'lemonade', 'smoothie', 'milkshake', 'punch', 'cordial',
]

export const NAME_COMBINATIONS = CHEERFUL.length * DOING.length * TREATS.length

const pick = <T,>(list: readonly T[]): T =>
  list[Math.floor(Math.random() * list.length)]!

/** A fresh candidate. The server decides whether it is actually free. */
export function proposeDeviceName(): string {
  return `${pick(CHEERFUL)}-${pick(DOING)}-${pick(TREATS)}`
}

/** Shape check, so a name from a device cannot be anything it likes. */
export function isWellFormedDeviceName(value: string): boolean {
  const parts = value.split('-')
  return (
    parts.length === 3 &&
    CHEERFUL.includes(parts[0]!) &&
    DOING.includes(parts[1]!) &&
    TREATS.includes(parts[2]!)
  )
}
