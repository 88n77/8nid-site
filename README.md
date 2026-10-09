# 8nID Anty Pro — сайт

Статичний сайт без збірки: HTML + CSS + vanilla JS. Хостинг — Vercel (деплой із цього репозиторію), домен 8nid.com.

## Сторінки
- `index.html` — лендинг (скрол): можливості, тарифи (живі ціни з `https://api.8nid.com/pay/plans`), завантаження, FAQ
- `account.html` — кабінет: вхід, підписка, оплата USDT, запрошення, пароль, відв'язка ПК
- `terms.html`, `privacy.html`, `rules.html` — юридичні документи

## Файли
- `assets/css/site.css` — спільні стилі; `assets/css/account.css` — кабінет
- `assets/js/site.js` — мови, шапка, тарифи, діалоги (спільний для всіх сторінок)
- `assets/js/account.js` — логіка кабінету
- `assets/js/i18n.js` — переклади (uk, en, pl, ru, fr, pt, tr); ключ використовується в `data-t`
- `assets/js/vendor/qrcode.js` — QR для рахунків (qrcode 1.5.4, MIT)

Після зміни CSS/JS підніміть `?v=` у підключеннях, щоб браузери взяли свіжу версію.

## Локально
```sh
python -m http.server 4173
```
На `localhost`/`127.0.0.1` сайт звертається до API `http://127.0.0.1:8080` (або `?api=…`); на справжньому домені — лише до `https://api.8nid.com`.
