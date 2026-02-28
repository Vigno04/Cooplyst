import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from './locales/en.json';
import translationIT from './locales/it.json';

import flagEN from './assets/flags/gb.png';
import flagIT from './assets/flags/it.png';

// Language registry: add a new entry here (+ matching locale file) to add a language
export const languages = [
    { code: 'en', translation: translationEN, flag: flagEN },
    { code: 'it', translation: translationIT, flag: flagIT },
];

const resources = Object.fromEntries(
    languages.map(({ code, translation }) => [code, { translation }])
);

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: 'en',
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        }
    });

export default i18n;
