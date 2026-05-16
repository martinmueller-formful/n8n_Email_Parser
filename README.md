# n8n_Email_Parser
Email Parser für n8n 


Workflow:

Der Schedule Trigger startet den Workflow automatisch in einem festen Intervall, zum Beispiel alle 15 Minuten. Er macht selbst noch nichts mit Daten, sondern sagt n8n nur: „Starte jetzt den Job-Import.“

Danach kommt Gmail: Get Many Messages. Dieser Node schaut in deiner Gmail-Mailbox nach Mails mit dem Label JobAlerts. Er holt eine Liste passender Job-Alert-Mails. Wichtig: Dieser Node liefert erstmal nur Basisdaten wie Mail-ID, Betreff, Absender und Snippet. Er ist also eher die „Mail-Liste“.

Danach kommt Gmail: Get a Message. Dieser Node nimmt die Mail-ID aus dem vorherigen Schritt und lädt die einzelne Mail vollständiger. Dadurch bekommst du mehr Inhalt aus der Mail, zum Beispiel HTML, Text, Betreff, Absender und mögliche Links. Ohne diesen Schritt hätte der Parser oft zu wenig Informationen.

Dann kommt der Code Node in JavaScript. 
*********** in diesen Node den Code einfügen *************
Das ist der eigentliche Parser. Er versucht, aus der Mail verwertbare Jobdaten zu machen. Er bereinigt komische Zeichen aus den Mails, erkennt die Quelle wie Indeed, StepStone oder LinkedIn, extrahiert Jobtitel, sucht nach Links, versucht Ort und Remote/Hybrid zu erkennen und baut daraus ein einheitliches Datenformat. Am Ende gibt der Code Node pro gefundenem Job ein Item aus, das ungefähr so aussieht: Datum, Quelle, Titel, Firma, Ort, Remote/Hybrid, Link, Kurzbeschreibung, Keywords, Status und Mail-Betreff.

Danach kommt Google Sheets: Append Row in Sheet. Dieser Node nimmt die strukturierten Daten aus dem Code Node und schreibt sie als neue Zeile in dein Google Sheet Jobs. Jede Spalte im Sheet bekommt den passenden Wert: Datum bekommt das Datum, Quelle bekommt zum Beispiel „Indeed“, Titel bekommt den Jobtitel, Link bekommt den Link und Status wird auf „neu“ gesetzt.
