# ספריות בפרויקט

Bootstrap 5.3.8, עיצוב RTL, מאוחסן מקומית תחת `vendor/bootstrap.rtl.min.css`. רישיון MIT כלול ב־`vendor/BOOTSTRAP-LICENSE.txt`. המקור: https://getbootstrap.com/docs/5.3/getting-started/rtl/ . לא נטען JavaScript של Bootstrap משום שהרכיב האינטראקטיבי היחיד הנדרש הוא חלונית, שממומשת ב־`dialog` תקני עם עיצוב חלונית של Bootstrap.

UIcons Regular Rounded, חבילת npm‏ `@flaticon/flaticon-uicons` בגרסה נעולה 3.3.1. קובצי המקור וה־WOFF2 נשמרים ב־`vendor/uicons`. הבנייה מפיקה CSS רק עבור האייקונים שבהם משתמש הממשק, וטוענת משפחת גופן אחת. קובץ הרישיון המקורי מצורף ב־`vendor/uicons/LICENSE.txt`. פרטי החבילה וחתימת ההפצה נשמרים ב־`vendor/uicons-package.json`.

בהתאם לבקשת המרצה, משתמשים ברישיון החינמי עם קרדיט קטן **בתחתית** הממשק הציבורי והעורך: `Uicons by Flaticon`, עם קישור פעיל. הקישור גלוי וניתן להפעלה במקלדת; הוא אינו מוסתר באמצעות CSS. ההנחיות הרשמיות: https://www.flaticon.com/uicons/get-started/ . הרישיון: https://github.com/freepik-company/flaticon-uicons/blob/main/LICENSE .

Rubik, גופן משתנה במשקלים 300–900, מאוחסן מקומית ב־`vendor/rubik/Rubik-Variable.ttf`. המקור: [מאגר Google Fonts הרשמי](https://github.com/google/fonts/tree/main/ofl/rubik), הורד ב־2026-10-05. רישיון SIL Open Font License 1.1 המקורי מצורף ב־`vendor/rubik/OFL.txt`. הבנייה מפיקה עותק עם חתימת תוכן ומפנה אליו מתוך ה־CSS המקומי. פרטי מקור וחתימה נמצאים ב־`vendor/rubik/source.json`.

איור דמויות הלמידה נוצר עבור הפרויקט בכלי יצירת התמונות המובנה, בהשראת הכיוון החזותי שסיפקה המרצה. הוא מאוחסן ב־`src/visuals/learning-buddies.png`, ומועתק בעת הבנייה ל־`assets` בשם עם חתימת תוכן. הפרומפט והקו המנחה לאיורים עתידיים מתועדים ב־`docs/VISUAL-DESIGN.md`.

אין טעינת גופנים מספק חיצוני, אנליטיקה, תמונות מרוחקות או תלות ב־CDN בזמן הפעלת האתר.
