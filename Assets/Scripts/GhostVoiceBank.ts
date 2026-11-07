/**
 * GhostVoiceBank — the spoken sound of every hiragana.
 *
 * Owns:  one pre-generated clip per character, keyed by the character itself.
 * Must not: play anything. GhostAudio owns playback; this is a lookup table.
 *
 * The design brief names a pre-generated clip per character as the DEFAULT for
 * the spoken sound, because text-to-speech may not run in the Lens Studio
 * preview. Clips are macOS `say -v Kyoko` (ja_JP), padded and peak-normalised.
 * Regenerate with tempAssetGen/gen_voice_kana.js.
 *
 * requireAsset only accepts string literals, so all 46 are spelled out. This
 * file is generated — edit the generator, not the table.
 */

/** character -> spoken clip. Covers all 46 basic hiragana. */
export const KANA_VOICE: { [ch: string]: AudioTrackAsset } = {
  "\u3042": requireAsset("../GeneratedSFX/Voice_a.wav") as AudioTrackAsset, // あ a
  "\u3044": requireAsset("../GeneratedSFX/Voice_i.wav") as AudioTrackAsset, // い i
  "\u3046": requireAsset("../GeneratedSFX/Voice_u.wav") as AudioTrackAsset, // う u
  "\u3048": requireAsset("../GeneratedSFX/Voice_e.wav") as AudioTrackAsset, // え e
  "\u304a": requireAsset("../GeneratedSFX/Voice_o.wav") as AudioTrackAsset, // お o
  "\u304b": requireAsset("../GeneratedSFX/Voice_ka.wav") as AudioTrackAsset, // か ka
  "\u304d": requireAsset("../GeneratedSFX/Voice_ki.wav") as AudioTrackAsset, // き ki
  "\u304f": requireAsset("../GeneratedSFX/Voice_ku.wav") as AudioTrackAsset, // く ku
  "\u3051": requireAsset("../GeneratedSFX/Voice_ke.wav") as AudioTrackAsset, // け ke
  "\u3053": requireAsset("../GeneratedSFX/Voice_ko.wav") as AudioTrackAsset, // こ ko
  "\u3055": requireAsset("../GeneratedSFX/Voice_sa.wav") as AudioTrackAsset, // さ sa
  "\u3057": requireAsset("../GeneratedSFX/Voice_shi.wav") as AudioTrackAsset, // し shi
  "\u3059": requireAsset("../GeneratedSFX/Voice_su.wav") as AudioTrackAsset, // す su
  "\u305b": requireAsset("../GeneratedSFX/Voice_se.wav") as AudioTrackAsset, // せ se
  "\u305d": requireAsset("../GeneratedSFX/Voice_so.wav") as AudioTrackAsset, // そ so
  "\u305f": requireAsset("../GeneratedSFX/Voice_ta.wav") as AudioTrackAsset, // た ta
  "\u3061": requireAsset("../GeneratedSFX/Voice_chi.wav") as AudioTrackAsset, // ち chi
  "\u3064": requireAsset("../GeneratedSFX/Voice_tsu.wav") as AudioTrackAsset, // つ tsu
  "\u3066": requireAsset("../GeneratedSFX/Voice_te.wav") as AudioTrackAsset, // て te
  "\u3068": requireAsset("../GeneratedSFX/Voice_to.wav") as AudioTrackAsset, // と to
  "\u306a": requireAsset("../GeneratedSFX/Voice_na.wav") as AudioTrackAsset, // な na
  "\u306b": requireAsset("../GeneratedSFX/Voice_ni.wav") as AudioTrackAsset, // に ni
  "\u306c": requireAsset("../GeneratedSFX/Voice_nu.wav") as AudioTrackAsset, // ぬ nu
  "\u306d": requireAsset("../GeneratedSFX/Voice_ne.wav") as AudioTrackAsset, // ね ne
  "\u306e": requireAsset("../GeneratedSFX/Voice_no.wav") as AudioTrackAsset, // の no
  "\u306f": requireAsset("../GeneratedSFX/Voice_ha.wav") as AudioTrackAsset, // は ha
  "\u3072": requireAsset("../GeneratedSFX/Voice_hi.wav") as AudioTrackAsset, // ひ hi
  "\u3075": requireAsset("../GeneratedSFX/Voice_fu.wav") as AudioTrackAsset, // ふ fu
  "\u3078": requireAsset("../GeneratedSFX/Voice_he.wav") as AudioTrackAsset, // へ he
  "\u307b": requireAsset("../GeneratedSFX/Voice_ho.wav") as AudioTrackAsset, // ほ ho
  "\u307e": requireAsset("../GeneratedSFX/Voice_ma.wav") as AudioTrackAsset, // ま ma
  "\u307f": requireAsset("../GeneratedSFX/Voice_mi.wav") as AudioTrackAsset, // み mi
  "\u3080": requireAsset("../GeneratedSFX/Voice_mu.wav") as AudioTrackAsset, // む mu
  "\u3081": requireAsset("../GeneratedSFX/Voice_me.wav") as AudioTrackAsset, // め me
  "\u3082": requireAsset("../GeneratedSFX/Voice_mo.wav") as AudioTrackAsset, // も mo
  "\u3084": requireAsset("../GeneratedSFX/Voice_ya.wav") as AudioTrackAsset, // や ya
  "\u3086": requireAsset("../GeneratedSFX/Voice_yu.wav") as AudioTrackAsset, // ゆ yu
  "\u3088": requireAsset("../GeneratedSFX/Voice_yo.wav") as AudioTrackAsset, // よ yo
  "\u3089": requireAsset("../GeneratedSFX/Voice_ra.wav") as AudioTrackAsset, // ら ra
  "\u308a": requireAsset("../GeneratedSFX/Voice_ri.wav") as AudioTrackAsset, // り ri
  "\u308b": requireAsset("../GeneratedSFX/Voice_ru.wav") as AudioTrackAsset, // る ru
  "\u308c": requireAsset("../GeneratedSFX/Voice_re.wav") as AudioTrackAsset, // れ re
  "\u308d": requireAsset("../GeneratedSFX/Voice_ro.wav") as AudioTrackAsset, // ろ ro
  "\u308f": requireAsset("../GeneratedSFX/Voice_wa.wav") as AudioTrackAsset, // わ wa
  "\u3092": requireAsset("../GeneratedSFX/Voice_wo.wav") as AudioTrackAsset, // を wo
  "\u3093": requireAsset("../GeneratedSFX/Voice_n.wav") as AudioTrackAsset, // ん n
};

/** character -> romaji, for on-screen reading hints. */
export const KANA_ROMAJI: { [ch: string]: string } = {
  "\u3042": "a",
  "\u3044": "i",
  "\u3046": "u",
  "\u3048": "e",
  "\u304a": "o",
  "\u304b": "ka",
  "\u304d": "ki",
  "\u304f": "ku",
  "\u3051": "ke",
  "\u3053": "ko",
  "\u3055": "sa",
  "\u3057": "shi",
  "\u3059": "su",
  "\u305b": "se",
  "\u305d": "so",
  "\u305f": "ta",
  "\u3061": "chi",
  "\u3064": "tsu",
  "\u3066": "te",
  "\u3068": "to",
  "\u306a": "na",
  "\u306b": "ni",
  "\u306c": "nu",
  "\u306d": "ne",
  "\u306e": "no",
  "\u306f": "ha",
  "\u3072": "hi",
  "\u3075": "fu",
  "\u3078": "he",
  "\u307b": "ho",
  "\u307e": "ma",
  "\u307f": "mi",
  "\u3080": "mu",
  "\u3081": "me",
  "\u3082": "mo",
  "\u3084": "ya",
  "\u3086": "yu",
  "\u3088": "yo",
  "\u3089": "ra",
  "\u308a": "ri",
  "\u308b": "ru",
  "\u308c": "re",
  "\u308d": "ro",
  "\u308f": "wa",
  "\u3092": "wo",
  "\u3093": "n",
};
