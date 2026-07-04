// 1. COLE A URL DA SUA PLANILHA AQUI DENTRO DAS ASPAS:
const SPREADSHEET_URL = "COLE_AQUI_A_URL_DA_SUA_PLANILHA"; 

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const doc = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    let sheet = doc.getSheetByName("Leads");
    
    // Agora temos uma coluna H extra para o Status do Calendário
    if (!sheet) {
      sheet = doc.insertSheet("Leads");
      sheet.appendRow(["Data", "Hora", "Nome", "WhatsApp", "Procedimento", "Horário Preferido", "Status", "Status Calendário"]);
      sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#f3f4f6");
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Data", "Hora", "Nome", "WhatsApp", "Procedimento", "Horário Preferido", "Status", "Status Calendário"]);
      sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#f3f4f6");
    }
    
    // Verifica se a coluna H existe (caso a planilha já exista com 7 colunas)
    if (sheet.getLastColumn() < 8) {
      sheet.getRange(1, 8).setValue("Status Calendário").setFontWeight("bold").setBackground("#f3f4f6");
    }

    const data = JSON.parse(e.postData.contents);
    
    if (data.test) {
      return ContentService
        .createTextOutput(JSON.stringify({ result: "success", message: "Conectado com sucesso!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- INTEGRAÇÃO COM GOOGLE CALENDAR ---
    let calendarEventStatus = "Sem data exata";
    if (data.time && data.time.includes("-") && data.time.includes(":")) {
      try {
        const parts = data.time.split(/[- :T]/);
        if (parts.length >= 5) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const hour = parseInt(parts[3], 10);
          const minute = parseInt(parts[4], 10);
          const startTime = new Date(year, month, day, hour, minute);
          const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
          const cal = CalendarApp.getDefaultCalendar();
          const event = cal.createEvent(
            "Sofia IA: " + data.name + " (" + (data.procedure || "Avaliação") + ")",
            startTime,
            endTime,
            {
              description: "Novo Lead capturado e qualificado pela Sofia IA.\n\n" +
                           "Nome: " + data.name + "\n" +
                           "WhatsApp: " + data.phone + "\n" +
                           "Procedimento: " + data.procedure
            }
          );
          event.addPopupReminder(15); 
          calendarEventStatus = "Agendado";
        } else {
          calendarEventStatus = "Formato de data inválido";
        }
      } catch (calError) {
        calendarEventStatus = "Erro: " + calError.toString();
      }
    }

    const row = [
      data.date || new Date().toLocaleDateString('pt-BR'),
      data.timestamp || new Date().toLocaleTimeString('pt-BR'),
      data.name || "-",
      data.phone || "-",
      data.procedure || "-",
      data.time || "-",
      (data.name && data.phone && data.procedure && data.time) ? "Qualificado" : "Parcial",
      calendarEventStatus
    ];

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ result: "success", row: sheet.getLastRow(), calendar: calendarEventStatus }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput("O Webhook da Sofia IA está online! SPREADSHEET_URL: " + SPREADSHEET_URL);
}
