# השפה החזותית של חומרי ההעשרה

עודכן: 2026-10-05. הכיוון הוא מודרני, קליל ומשחקי, בהשראת צילום הדמויות והפלטה שסיפקה המרצה. דמויות מקוריות בנפח רך מלווות את החיפוש והלמידה; הן משולבות בכותרת הקומפקטית ובמסך הכניסה. האייקונים התפקודיים נשארים ממשפחת UIcons המעוגלת, עם קרדיט נגיש בתחתית.

## פלטה ושימוש

| צבע | קוד | שימוש |
| --- | --- | --- |
| כחול עמוק | #060581 | כותרות, קישורים, מסנן נבחר, מיקוד |
| לבנדר | #DBCDE7 | כרטיסיות מסוג אתר ומשחק, רקע האיור, מצבים נבחרים |
| לבנדר בהיר מאוד | #F3EDF7 | רקע כותרת המאגר הציבורי |
| כתום | #FC6E24 | פעולה ראשית, סוגי סרטון וקובץ |
| חום כהה | #401A0B | טקסט גוף, טקסט וגבול על כתום וצהוב |
| צהוב | #C9C444 | הדגשות, כלי וכתבה |
| נייר בהיר | #F7F6F2 | רקע משובץ עדין; נדגם מהתמונה שסופקה |
| לבן חם | #FFFEFB | משטחי כרטיסיות וטפסים |

צבעי עזר: #605266 לטקסט משני, #766986 לגבולות שדות, #EFE7F5 לתגיות, ו־#F88A4B לריחוף פעולה ראשית. הודעות שגיאה והצלחה משתמשות בצבעי מצב כהים. כתום וצהוב מלווים בטקסט חום; מסנן כחול מלווה בטקסט לבן. אין טקסט בהיר על כתום או צהוב.

הגופן Rubik מאוחסן באתר עם הרישיון שלו. הכרטיסיות והפקדים משתמשים בפינות רכות ובקצה תחתון שנותן תחושת נפח. הכותרת לצד אייקון הסוג; שם הסוג נשמר לקורא מסך ואינו מוצג בכרטיסייה. בתפריט הסינון מופיעים שם ואייקון לכל סוג ותיבות בחירה מרובה. כפתור הפתיחה בצבע הסוג, עם טקסט כהה או בהיר לפי הניגודיות. רק קובץ מסומן להורדת הקובץ; קבצים מקומיים יורדים באמצעות קישור עם download. איורים וריבועים דקורטיביים אינם מקבלים מיקוד.

החיפוש ותפריט הסוג באותה שורה, ובמחשב גם בורר הקורס. תוויות השדות ותיאור החיפוש נשארים נגישים לקורא מסך. אין שורת תוצאות גלויה; מספר התוצאות מוכרז באזור הסטטוס הנגיש. הפוטר כולל פותח בעזרת AI וקרדיט Flaticon.

בריחוף או במיקוד הכרטיסייה מתרוממת מעט, אייקון הסוג נוטה והריבועים הדקורטיביים נעים. הכפתור מגיב בריחוף נפרד. התנועות קצרות ומופעלות באינטראקציה, ללא לולאה מתמשכת; במצב הפחתת תנועה מבוטלים גם המעברים וגם שינויי המיקום.

## ניגודיות ובדיקות

בדיקות החישוב ב־tests/contrast.test.mjs קוראות את צבעי המקור מתוך styles.css. הן דורשות לפחות 4.5:1 לשילובי הטקסט והאייקונים שנבדקו, ולפחות 3:1 לגבולות ולמיקוד מול המשטחים הצמודים. הבדיקה כוללת גם את הנקודה הכהה ביותר ברשת הרקע. היא אינה מחליפה בדיקה בדפדפן של התצוגה, ההגדלה, השימוש במקלדת וקורא המסך. ההנחיות לכך נמצאות ב־MANUAL-TESTING.md.

| שילוב | יחס שנמדד |
| --- | --- |
| כחול על לבנדר | 10.32:1 |
| חום על כתום | 5.40:1 |
| חום על צהוב | 8.36:1 |
| לבן חם על כחול | 15.46:1 |
| טקסט משני על לבנדר | 4.80:1 |

## איור מקורי וקבצים

האיור נוצר באמצעות כלי יצירת התמונות המובנה, על רקע שקוף. הוא נבדק כקובץ תמונה: PNG עם ערוץ שקיפות, בגודל 1774×887. מקור האיור הוא src/visuals/learning-buddies.png. קובץ ההפצה נמצא ב־assets/ בשם הכולל חתימת תוכן, ומופיע ב־assets/manifest.json.

כל שינוי באיור או בגופן דורש הרצת הבנייה מחדש. הבנייה משנה את שם הקובץ לפי התוכן, מעדכנת את ההפניות ב־HTML וב־CSS ומסירה רק קובצי הפצה ישנים שהיא יצרה. יש להעלות את ה־HTML ואת assets יחד. אין פנייה לשירות תמונות או לספק גופן בזמן השימוש באתר.

## קו מנחה לאיורים נוספים

דמויות בלוק בעלות פינות מעוגלות, מרקם חימר או גומי מט, נפח ותאורה רכים, הבעות סקרניות ופרופורציות פשוטות. השתמשו בפלטה הקבועה, ברקע שקוף ובאביזר בודד הקשור לפעולה או ללמידה. שמרו על מספר דמויות קטן, ללא טקסט בתוך האיור, והימנעו מפרטים זעירים שלא יהיו קריאים בגודל תצוגה קטן.

## הפרומפט שבו נוצר האיור

Create an original polished 3D clay illustration asset for a modern, light, playful Hebrew educational resource library. A compact duo of friendly rounded rectangular block characters, fully isolated as a cutout on a transparent background. This is an illustration for a real interface, NOT a website mockup. Horizontal composition, approximately 2:1 proportions, with both characters' whole bodies visible and ample clear padding.

Art direction: premium soft matte molded clay or rubber, clean rounded bevels, chunky sculptural proportions, tiny expressive brows, oversized oval cream eyes with dark cocoa pupils, understated dimensional noses and small friendly smiles. Curious, intelligent, playful rather than babyish. Diffuse soft studio lighting, subtle contact shadows only under characters, crisp clean silhouette, no glossy reflections. The characters lean slightly toward one another like learning companions. The larger character is a deep indigo rounded upright book-like block, carrying a small pale lavender open book with cream pages. The smaller warm orange rounded cube looks through a small yellow round magnifying glass, with one eye enlarged slightly by the glass. Minimal rounded limbs, no human skin, no intricate fingers. Restrained tactile detail.

Strict palette: indigo #060581, lavender #DBCDE7, orange #FC6E24, dark cocoa #401A0B, yellow #C9C444, warm ivory #F7F5ED for eyes and book pages. Use only these colors and lighting variations. Dark cocoa pupils and facial features. Very simple props. Make a lovely cohesive original asset, not a copy of an existing character. No writing, no letters, no logo, no UI, no border, no scene, no solid background, no floor plane, no extra objects. The indigo character stands on the left and the smaller orange character on the right. High resolution transparent PNG, natural edges, no white halo.
