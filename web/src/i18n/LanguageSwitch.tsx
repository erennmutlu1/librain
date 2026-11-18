import { LANGS, strings, useLang, useT } from './lang';
import styles from './LanguageSwitch.module.css';

const text = strings({
  en: { group: 'Language', names: { en: 'English', tr: 'Turkish' } },
  tr: { group: 'Dil', names: { en: 'İngilizce', tr: 'Türkçe' } },
});

/** EN | TR in the header. Each button names its language in that language for screen readers. */
export function LanguageSwitch() {
  const { lang, setLang } = useLang();
  const t = useT(text);
  return (
    <div className={styles.switch} role="group" aria-label={t.group}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={styles.option}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          title={l === 'en' ? 'English' : 'Türkçe'}
        >
          <span aria-hidden="true">{l.toUpperCase()}</span>
          <span className="visually-hidden">{l === 'en' ? 'English' : 'Türkçe'}</span>
        </button>
      ))}
    </div>
  );
}
