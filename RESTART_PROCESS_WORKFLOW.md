# Restart The Process Workflow

यह document **Restart The Process** module का current working workflow बताता है। Future में कोई बदलाव या issue आए तो इसी file को reference मानें और बदलाव के साथ इसे भी update करें।

## 1. Source of truth

- Google Sheet application का primary और only data source है।
- Restart workflow का main data `FMS` sheet में रहता है।
- Local Storage से Restart Pending या History restore नहीं होती।
- App हर 15 seconds में और window focus होने पर Google Sheet से silent sync करती है।

## 2. Restart Pending में record कब आता है

Order Restart Pending में तभी दिखेगा जब:

1. `Followup for Shutdown` में call outcome **Forget to taken** हो।
2. उस order का Restart Process पहले complete न हुआ हो।
3. FMS Step 5 task Pending हो।

इनमें से कोई condition पूरी न होने पर record Pending में नहीं दिखेगा।

## 3. Pending table mapping

| App field | Data source |
|---|---|
| Old Service Order | FMS Service Order No. |
| Planned Date | FMS column `AB` only |
| Company | Old order/company record |
| Old Campaign No. | FMS Campaign No.; UI में `Camp-2` format |
| Old Kiln No. & Size | FMS Kiln No. and Kiln Size |
| Old Campaign Start Date | FMS Campaign Start Date |
| Old Expected Shutdown | FMS Expected Shutdown Date |

महत्वपूर्ण:

- Planned Date के लिए Followup timestamp या calculated fallback use नहीं होता।
- AB खाली होने पर Planned Date में `—` दिखेगा।
- Call Log column Restart Pending table से हटा दिया गया है।

## 4. Company Visit form submit flow

Form submit होने पर यह sequence चलता है:

1. Old order को close किया जाता है।
2. New service order `Re{Old Service Order}` format में बनता है। Example: `CN-02` → `ReCN-02`.
3. New campaign/order और Company Visit record बनाया जाता है।
4. New order का Visit task complete और Running Inspection task pending बनाया जाता है।
5. Old order का FMS Step 5 update होता है:
   - `AC` में live Actual timestamp
   - `AD` में `Restarted -> ReCN-XX` status
6. New `ReCN` order का Step 1 data FMS sheet में save होता है।
7. Sheet refresh के बाद submitted record Pending से हटकर History में जाता है।
8. Submit success होने पर app automatically History tab खोलती है।

## 5. FMS Step 5 columns

| Column | Field | Rule |
|---|---|---|
| `AB` | Planned | Sheet/formula controlled; app इसे overwrite नहीं करती |
| `AC` | Actual | Restart form submit होने पर live timestamp |
| `AD` | Status | `Restarted -> ReCN-XX` |
| `AE` | Delay | Sheet/formula controlled; app इसे overwrite नहीं करती |

## 6. Pending से History जाने का rule

Restart complete माना जाएगा जब इनमें से कोई condition true हो:

- FMS `AC` में Step 5 Actual मौजूद हो; या
- FMS `AD` status में `Restarted`, `Closed` या `Completed` हो।

Complete होने पर:

- Old order status `closed` बनता है।
- Restart task status `done` बनता है।
- Forget call record Pending से exclude होता है।
- History record FMS Step 5 और linked `ReCN` order से rebuild होता है।

यह rebuild जरूरी है, क्योंकि हर Google Sheet refresh के बाद app data दोबारा sheet से बनाती है।

## 7. History mapping

History में source old order और linked new `ReCN` order दोनों use होते हैं:

| History field | Source |
|---|---|
| ReCN No. | FMS AD के `Restarted -> ...` से linked order |
| Old Service Order No. | Completed Step 5 वाला old order |
| Company | New ReCN order; fallback old order |
| Campaign No. | New ReCN campaign; UI में `Camp-X` |
| Kiln No. & Size | Linked order kiln |
| Campaign Starting Date | New ReCN order campaign start date |
| Inspection Incharge | New ReCN order; fallback old order |

## 8. Main code locations

- UI and submit flow: `src/pages/RestartProcessPage.jsx`
- Google Sheet read/build mapping: `src/services/googleSheets.js`
- Google Apps Script write API: `code.gs`
- App refresh/silent sync: `src/hooks/useData.js`
- Google Sheet mapping tests: `src/utils/googleSheets.test.js`

## 9. Future update checklist

Restart workflow में बदलाव करते समय:

1. FMS column numbers और headings verify करें।
2. `code.gs` और `src/services/googleSheets.js` दोनों mappings साथ update करें।
3. Protected columns `AB` Planned और `AE` Delay को app से overwrite न करें।
4. Pending filter और History reconstruction दोनों update करें।
5. New status text हो तो completion detection update करें।
6. Sheet-only behavior बनाए रखें; Local Storage fallback न जोड़ें।
7. `npm.cmd test -- --run` चलाएँ।
8. `npm.cmd run build` चलाएँ।
9. `code.gs` बदले तो Google Apps Script की नई deployment/version publish करें।
10. इस document को भी नए workflow के अनुसार update करें।

## 10. Troubleshooting

### Submit के बाद record Pending में ही है

- FMS old order row के `AC` और `AD` check करें।
- `AC` में Actual timestamp और `AD` में `Restarted -> ReCN-XX` होना चाहिए।
- New `ReCN-XX` row FMS में मौजूद होनी चाहिए।
- App में Sync दबाएँ।
- अगर `code.gs` बदला था तो confirm करें कि latest Apps Script deployment live है।

### History 0 दिखा रही है

- FMS Step 5 Actual/Status खाली तो नहीं है, check करें।
- AD में linked ReCN number spelling FMS new order number से match करें।
- Browser console में Google Sheet fetch/API error check करें।

### Planned Date गलत या blank है

- Planned Date केवल FMS column `AB` से आती है।
- AB formula/value और cell date format check करें।
- Followup timestamp Planned Date के लिए use नहीं होगा।

