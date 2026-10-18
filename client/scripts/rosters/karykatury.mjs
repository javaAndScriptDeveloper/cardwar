/**
 * «Карикатури (сатира)»: the likeness deck. Eighteen public figures, two per rank, one colour each; every card is
 * a painted caricature from the LoRA pipeline (art/lora, portraits picked by the owner into `final/`), titled by a
 * nickname rather than the surname, with a one-line caption in the deadpan register of the other satire packs:
 * parody of public conduct, obviously made up, never presented as news. The same content boundary as
 * docs/superpowers/specs/2026-10-13-popular-polish-design.md §2 applies; the satire stamp stays on every face.
 *
 * `faces` says which portrait (1 = first role, 2 = second role, as art/lora/pod/portraits.py numbers them) goes on
 * which of the persona's two suits. A persona without a portrait yet keeps the vector avatar from `look`.
 */
import { FONT, H, W, frame } from '../lib/poster.mjs';
import blogery from './blogery.mjs';
import sluhy from './sluhy-narodu.mjs';

const personas = [
    {
        rank: 'ACE',
        side: 'red',
        name: 'Голобородько',
        role: 'президент із серіалу',
        emoji: '🎬',
        tag: 'zelenskyi',
        faces: { HEARTS: 1, DIAMONDS: 1 },
        quotes: {
            HEARTS: 'Пригніться! Голобородько стріляє по Верховній Раді!',
            DIAMONDS: 'Вийди звідси, розбійник. Я тут танцюю.',
        },
    },
    {
        rank: 'ACE',
        side: 'black',
        name: 'Сірий кардинал',
        role: 'офіс на Банковій',
        emoji: '🧵',
        tag: 'yermak',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: 'Ниточки тягну я. Ви просто танцюєте.',
            CLUBS: 'Іду на фронт. Валіза вже на Банковій.',
        },
    },
    {
        rank: 'KING',
        side: 'red',
        name: 'Шоколадний король',
        role: 'фабрика і труби',
        emoji: '🍫',
        tag: 'poroshenko',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Карамель у кожну хату. Фабрику — собі.',
            DIAMONDS: 'Стадіон? Так стадіон. На коліна? Ну, на коліна.',
        },
    },
    {
        rank: 'KING',
        side: 'black',
        name: 'Мер-боксер',
        role: 'жетон і каштани',
        emoji: '🥊',
        tag: 'klychko',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: 'Жетон подорожчав, як удар: раптово.',
            CLUBS: 'Сніг прибрав сам. Лопатою. Для камери.',
        },
    },
    {
        rank: 'QUEEN',
        side: 'red',
        name: 'Коса',
        role: 'газ за пів ціни',
        emoji: '🎀',
        tag: 'tymoshenko',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Коса — сила. Газ — за пів ціни. Колись.',
            DIAMONDS: 'Вона працює. Каска — доказ.',
        },
    },
    {
        rank: 'QUEEN',
        side: 'black',
        name: 'Нічна зміна',
        role: 'пост о третій ночі',
        emoji: '📱',
        tag: 'bezuhla',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: 'Третя ночі. Винні всі. Пост опубліковано.',
            CLUBS: 'Худі, ноутбук, енергетик. Генерала звільнено.',
        },
    },
    {
        rank: 'JACK',
        side: 'red',
        name: 'Збір на супутник',
        role: 'ведучий і волонтер',
        emoji: '🛰️',
        tag: 'prytula',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Скинулись на супутник. Здачу — на тепловізор.',
            DIAMONDS: 'Золотий мікрофон. Збір закрито за годину.',
        },
    },
    {
        rank: 'JACK',
        side: 'black',
        name: 'Міністр дронів',
        role: 'стрім, суд, збір',
        emoji: '🛸',
        tag: 'sternenko',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: 'Міністр дронів. Бюджет — ваші донати.',
            CLUBS: 'Суд, стрім, збір. Порядок довільний.',
        },
    },
    {
        rank: 'TEN',
        side: 'red',
        name: 'Два-три тижні',
        role: 'календар і кушетка',
        emoji: '📅',
        tag: 'arestovych',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Усе скінчиться за два-три тижні. Таймер скинуто.',
            DIAMONDS: 'Лягайте. Я вже пояснив, чому ви помиляєтесь.',
        },
    },
    {
        rank: 'TEN',
        side: 'black',
        name: 'Термінове звернення',
        role: 'три телефони',
        emoji: '⚡',
        tag: 'honcharenko',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: '⚡ Термінове звернення. Кінець звернення.',
            CLUBS: 'Вибіг з Ради швидше, ніж голосування.',
        },
    },
    {
        rank: 'NINE',
        side: 'red',
        name: 'Орел і решка',
        role: 'золота картка',
        emoji: '🪙',
        tag: 'nikitiuk',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Золота картка — або сто доларів і маршрутка.',
            DIAMONDS: 'Орел чи решка? Випала маршрутка.',
        },
    },
    {
        rank: 'NINE',
        side: 'black',
        name: 'Диванний критик',
        role: 'дивиться ваші сторіс',
        emoji: '🛋️',
        tag: 'durnev',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: 'Подивився сторіс. Вимкнув звук. Двійка.',
            CLUBS: 'Диван, монітор, вирок. Наступний!',
        },
    },
    {
        rank: 'EIGHT',
        side: 'red',
        name: 'Поп-діва',
        role: 'паєтки і хіти',
        emoji: '✨',
        tag: 'dorofeeva',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Паєтки блищать голосніше за трек.',
            DIAMONDS: 'Дзвонили з 2010-х. Просили лук назад.',
        },
    },
    {
        rank: 'EIGHT',
        side: 'black',
        name: 'Вампір зі Львова',
        role: 'усі відтінки спокуси',
        emoji: '🧛',
        tag: 'dantes',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: 'Усі відтінки спокуси. Жоден не вдався.',
            CLUBS: 'Орел і решка: Львів, 1890-й, медальйон тріснув.',
        },
    },
    {
        rank: 'SEVEN',
        side: 'red',
        name: 'Карлсон',
        role: 'живе на даху енергетики',
        emoji: '🪫',
        tag: 'mindich',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Карлсон із пропелером. Дах — енергетика.',
            DIAMONDS: 'Плівки крутяться. Пропелер теж.',
        },
    },
    {
        rank: 'SEVEN',
        side: 'black',
        name: 'Гоблін з лимонами',
        role: 'чорний кіт, нуль відсотків',
        emoji: '🍋',
        tag: 'horokhovskyi',
        faces: { SPADES: 1, CLUBS: 2 },
        quotes: {
            SPADES: 'Чорний кіт, лимон, комісія нуль відсотків.',
            CLUBS: 'Кешбек є. Лимон не повертається.',
        },
    },
    {
        rank: 'SIX',
        side: 'red',
        name: 'Сільський репер',
        role: 'корова на біті',
        emoji: '🐄',
        tag: 'petya',
        faces: { HEARTS: 1, DIAMONDS: 2 },
        quotes: {
            HEARTS: 'Корова на біті. Гриби на хуку. Село на хайпі.',
            DIAMONDS: 'Золотий мікрофон, камуфляж, трек про гриби.',
        },
    },
    {
        rank: 'SIX',
        side: 'black',
        name: 'Акваріум з акулами',
        role: 'офіс, потім нари',
        emoji: '🦈',
        colour: '#01579b',
        tag: 'kolomoisky',
        faces: { SPADES: 1, CLUBS: 2 },
        look: { hair: 'short', hairColour: '#8d8d8d', beard: 'full', clothes: 'tee' },
        quotes: {
            SPADES: 'Акули в офісі ситі. Банк — ні.',
            CLUBS: 'Нари, ковдра, телефон. Бізнес іде.',
        },
    },
].map((persona) => ({
    // The frame colour follows the card colour; the vector fallback needs one too.
    colour: persona.side === 'red' ? '#c62828' : '#1d1d24',
    look: persona.look ?? { hair: 'short', clothes: 'suit' },
    ...persona,
}));

const tags = new Set(personas.map((persona) => persona.tag));
// The table talk comes from the two satire rosters: every rule whose persona is in this deck, with the sounds and
// animations it needs. The Zelenskyi rule speaks through a bubble only until the real clip lands (#103).
const usesTag = (node) =>
    JSON.stringify(node)
        .match(/"tag":"([a-z]+)"/g)
        ?.every((hit) => tags.has(hit.slice(7, -1))) ?? true;
const seen = new Set();
const rules = [...sluhy.rules, ...blogery.rules].filter(
    (rule) => usesTag(rule.if ?? {}) && !seen.has(rule.id) && seen.add(rule.id),
);
const sounds = { ...sluhy.sounds, ...blogery.sounds };
const animations = { ...sluhy.animations, ...blogery.animations };
const styles = `${sluhy.styles}\n${blogery.styles}`;

/** Dark felt, a lattice of suit glyphs and a laurel badge; no faces, no names. */
function back() {
    const glyphs = [];
    const row = ['♠', '♥', '♦', '♣'];
    for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 6; x += 1) {
            const glyph = row[(x + y) % 4];
            const red = glyph === '♥' || glyph === '♦';
            glyphs.push(
                `<text x="${26 + x * 38 + (y % 2) * 19}" y="${34 + y * 40}" text-anchor="middle" font-size="22" fill="${red ? '#ef5350' : '#cfd8dc'}" fill-opacity="0.16">${glyph}</text>`,
            );
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<radialGradient id="felt" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="#2b3a55"/><stop offset="1" stop-color="#0f1626"/></radialGradient>
</defs>
${frame()}
<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="14" fill="url(#felt)"/>
<g ${FONT} font-weight="700">${glyphs.join('\n')}</g>
<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="14" fill="none" stroke="#f2c14e" stroke-opacity="0.7" stroke-width="2"/>
<rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="10" fill="none" stroke="#f2c14e" stroke-opacity="0.35"/>
<circle cx="${W / 2}" cy="${H / 2}" r="58" fill="#0f1626" stroke="#f2c14e" stroke-width="3"/>
<circle cx="${W / 2}" cy="${H / 2}" r="50" fill="none" stroke="#f2c14e" stroke-opacity="0.5" stroke-dasharray="3 4"/>
<text x="${W / 2}" y="${H / 2 - 10}" text-anchor="middle" ${FONT} font-weight="700" font-size="30" fill="#f2c14e">🃏</text>
<text x="${W / 2}" y="${H / 2 + 18}" text-anchor="middle" ${FONT} font-weight="700" font-size="13" letter-spacing="2" fill="#ffffff">КАРИКАТУРИ</text>
<text x="${W / 2}" y="${H / 2 + 36}" text-anchor="middle" ${FONT} font-size="10" letter-spacing="3" fill="#ef5350">САТИРА</text>
</svg>
`;
}

export default {
    id: 'karykatury',
    name: 'Карикатури (сатира)',
    pairs: true,
    personas,
    back,
    styles,
    sounds,
    animations,
    rules,
};
