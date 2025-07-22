// ==UserScript==
// @name         QuickBooks Invoice Auto-Fill
// @namespace    Neovexa Scripts
// @version      1.1
// @description  Auto-fills invoice fields with human-like typing
// @author       Neovexa
// @match        *://qbo.intuit.com/app/invoice?txnId=*
// @grant        none
// ==/UserScript==

let FILEARRAY;
let bonusDataRows = [];
const DEBUGME = false;

async function simulateTypingUsingKeyboard(
  field,
  value,
  tab = false,
  time = 300,
) {
  return new Promise((resolve) => {
    let i = 0;

    function typeCharacter() {
      if (i < value.length) {
        field.focus(); // Set focus on the field to start typing
        field.setRangeText(
          value.charAt(i),
          field.value.length,
          field.value.length,
          'end',
        );
        field.dispatchEvent(
          new Event('input', { bubbles: true, cancelable: true }),
        );

        i++;
        let delay =
          Math.floor(Math.random() * (time - time / 2 + 1)) + time / 2;
        setTimeout(typeCharacter, delay);
      } else {
        console.log(`✅ Finished typing: ${value}`);

        // If tab is true, simulate pressing the Tab key
        tabAction(field, tab);

        resolve(); // Complete Promise
      }
    }

    field.focus();
    field.value = '';
    typeCharacter();
  });
}

function clickSaveButtonInPopover() {
  // Locate the div that contains both Cancel and Save buttons
  const buttonSection = document.querySelectorAll(
    '[class*="Popover-buttonSection"]',
  )[0];

  if (buttonSection) {
    // Find the button with the text "Save"
    const saveButton = Array.from(
      buttonSection.querySelectorAll('button'),
    ).find((button) => button.textContent.trim() === 'Save');
    console.log(saveButton);
    // saveButton.textContent = "Save Me";

    if (saveButton) {
      console.log('✅ Found Save button. Set focus on button...');
      saveButton.focus();
      setTimeout(() => {
        console.log('Clicking Save button now...');
        saveButton.click();
      }, 2000);
    } else {
      console.log('❌ Save button not found inside the Popover.');
    }
  } else {
    console.log('❌ Popover button section not found.');
  }
}

function saveAndCloseInvoice() {
  const button = document.querySelector(
    'button[aria-haspopup="menu"][aria-label="Save menu"][title="Save menu"]',
  );

  const saveAndCloseButton = Array.from(
    document.querySelectorAll('button'),
  ).find((button) => button.textContent.trim() === 'Save and close');

  if (button) {
    button.click();
    console.log('✅ Save menu button clicked');

    // Wait for the dropdown menu to render, then select "Save and close"
    setTimeout(() => {
      const menuItems = document.querySelectorAll('li[role="none"]');

      // Find the "Save and close" option by text content
      const saveAndCloseOption = Array.from(menuItems).find((li) =>
        li.textContent.trim().startsWith('Save and close'),
      );

      if (saveAndCloseOption) {
        saveAndCloseOption.click();
        console.log("✅ 'Save and close' option selected");
      } else {
        console.error("❌ 'Save and close' option not found");
      }
    }, 2000); // Adjust delay if needed to wait for menu to load
  } else if (saveAndCloseButton) {
    saveAndCloseButton.click();
    console.log("✅ 'Save and close' button clicked.");
  } else {
    console.error('❌ Save and close menu button not found');
  }
}

async function openAndFillCcDialog(ccBccButton, ccEmails) {
  if (ccBccButton) {
    ccBccButton.click();
    console.log('📩 Cc/Bcc button clicked, waiting for the popover to open...');

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for popover

    let ccField = document.querySelector(
      'input[aria-label="Cc"], input[placeholder="Separate emails with commas"]',
    );
    if (ccField) {
      console.log('📝 Typing Cc email addresses...');
      await simulateTypingUsingKeyboard(ccField, ccEmails);
      clickSaveButtonInPopover();
    } else {
      console.warn('❌ Cc field not found inside the Cc/Bcc dialog!');
    }
  } else {
    console.warn('❌ Cc/Bcc button not found!');
  }
}

const providerData = {
  'Care.com': {
    customerEmail: 'accountspayable@care.com',
    billTo: 'Care.com',
    employeeName: 'Care.com',
    ccEmails: 'agencyinvoices@care.com, accounts@curain.org',
    terms: 'Due on receipt',
    location: 'NJ',
    inaccurateProductServiceValue: ['Care.com'],
    correctProductServiceValue: 'Care.com BUC childcare',
  },
  'Bright Horizons': {
    customerEmail: 'providerbilling@brighthorizons.com',
    billTo: 'Bright Horizons',
    employeeName: 'Bright Horizons',
    ccEmails: 'accounts@curain.org',
    terms: 'Due on receipt',
    location: 'NJ',
    inaccurateProductServiceValue: ['BH Childcare'],
    correctProductServiceValue: 'BH CHC - Childcare & Babysitting',
  },
  'Care.com Adult Backup Care': {
    customerEmail: 'adultcarebilling@care.com',
    billTo: 'Care.com Adult Backup Care',
    employeeName: 'Care.com Adult Backup Care',
    ccEmails: 'accounts@curain.org',
    terms: 'Due on receipt',
    location: 'NJ',
    inaccurateProductServiceValue: [''],
    correctProductServiceValue: 'Care.com Companionship Services',
  },
};

function recipientCount(providerName, data, fileArray) {
  if (DEBUGME) debugger;
  const matchedEntry = providerFunctions[providerName].matchedEntry(
    fileArray,
    normalizeDate(data.serviceDate),
    convertNameFormat(data.client),
    convertNameFormat(extractCaregiver(data.description)),
  );

  return (
    matchedEntry?.['Care Recipient Names'].split(',')?.length ?? 'XXXXXX__NF'
  );
}

function recipientNames(providerName, data, fileArray) {
  const matchedEntry = providerFunctions[providerName].matchedEntry(
    fileArray,
    normalizeDate(data.serviceDate),
    convertNameFormat(data.client),
    convertNameFormat(extractCaregiver(data.description)),
  );

  return matchedEntry?.['Care Recipient Names'] ?? 'XXXXXX__NF';
}

async function selectDueOnReceipt(field, value) {
  return new Promise((resolve) => {
    console.log('Entered into selectDueOnReceipt function!!');
    // Step 1: Focus and click to open the dropdown
    field.dispatchEvent(
      new FocusEvent('focus', { bubbles: true, cancelable: true }),
    );
    field.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    // Step 2: Wait for the dropdown to render and then select "Due on receipt"
    const checkInterval = setInterval(() => {
      // Locate the dropdown container
      const dropdownMenu = document.querySelector(
        'div[role="listbox"][class*="DropdownTypeahead-menuWrapper"]',
      );

      if (dropdownMenu) {
        // Select all <ul> elements representing options
        const options = dropdownMenu.querySelectorAll('ul[role="option"]');

        if (options.length > 0) {
          // Find the specific option for "Due on receipt"
          const dueOnReceiptOption = Array.from(options).find((option) => {
            const labelSpan = option.querySelector('span.rowTextLabel');
            return labelSpan && labelSpan.textContent.trim() === value;
          });

          if (dueOnReceiptOption) {
            clearInterval(checkInterval);
            console.log("✅ Found 'Due on receipt'. Selecting...");
            dueOnReceiptOption.click();
            // field.removeEventListener("blur", preventBlur, true);
            resolve();
          } else {
            console.warn("❌ 'Due on receipt' option not found.");
          }
        } else {
          console.warn('❌ No options found in the dropdown.');
        }
      } else {
        console.warn('❌ Dropdown menu container not found.');
      }
    }, 1000); // Check every 1 second
  });
}

async function selectLocation(field, value) {
  return new Promise((resolve) => {
    // Step 1: Click to open dropdown
    field.click(); // Open the dropdown

    // Step 2: Wait briefly to ensure dropdown options are rendered
    const checkInterval = setInterval(() => {
      // Step 3: Select the option with text "NJ"
      const options = document.querySelectorAll('div[role="listbox"] ul');

      if (options.length > 0) {
        for (let option of options) {
          const optionText = option.textContent.trim();
          if (optionText === value) {
            clearInterval(checkInterval);
            option.click(); // Click the matching option
            console.log(`✅ "${value}" selected.`);
            resolve();
            return;
          }
        }
        console.log(`❌ "${value}" not found in the dropdown.`);
      } else {
        console.log('❌ No dropdown options found.');
      }
    }, 500); // Check every half second
  });
}

async function focusCursorInField(field, delay = 3000) {
  // Focus the field and move the cursor to the end
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);

  console.log(
    '✍️ Cursor placed in the field, waiting for it to blink naturally...',
  );

  // Wait for the specified delay (cursor blinks naturally during this time)
  await new Promise((resolve) => setTimeout(resolve, delay));

  console.log('✅ Cursor interaction completed.');
}

async function updateDescriptionFields(newDataObject) {
  const providerName = getProviderName();

  const table = document.querySelector('table[role="table"]');
  if (!table) {
    console.error('❌ Invoice table not found!');
    return;
  }

  console.log('🔄 Updating Description fields...');

  // Get table headers to find the "Description" column index
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
    th.textContent.trim(),
  );
  const descriptionIndex = headers.indexOf('Description');

  if (descriptionIndex === -1) {
    console.error("❌ 'Description' column not found.");
    return;
  }

  // Get all rows in the table body
  const rows = table.querySelectorAll('tbody tr');

  for (const row of rows) {
    try {
      const cells = Array.from(row.querySelectorAll('td'));
      const descriptionCell = row.querySelectorAll('td')[descriptionIndex];
      const descriptionField =
        cells[descriptionIndex]?.querySelector('textarea');
      if (!descriptionCell) return; // Skip if no description cell found

      let descriptionText = descriptionCell.textContent.trim();
      let descriptionFieldText = descriptionField.textContent.trim();

      if (!descriptionFieldText.includes('XXXXXX__NF')) {
        console.log('Skipping this row');
        continue;
      }
      if (!descriptionText) return; // Return if empty description found

      // Extract key fields from Description using regex
      const serviceDateMatch = descriptionText.match(
        /Service Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/,
      );

      // Try "Lastname, Firstname"
      let employeeMatch = descriptionText.match(
        /Employee Name:\s*([\wÀ-ÖØ-öø-ÿ\s-]+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)(?=\n|$)/,
      );

      // If no match, try "Firstname Lastname" format
      if (!employeeMatch) {
        employeeMatch = descriptionText.match(
          /Employee Name:\s*([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)(?=\n|$)/,
        );
      }

      // Try "Lastname, Firstname"
      let caregiverMatch = descriptionText.match(
        /Caregiver:\s*([\w\s-]+),\s*([\w\s-]+(?:\s\d+)*)(?=\n|$)/,
      );

      // If no match, try "Firstname Lastname" format
      if (!caregiverMatch) {
        caregiverMatch = descriptionText.match(
          /Caregiver:\s*([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)(?=\n|$)/,
        );
      }

      if (!serviceDateMatch || !employeeMatch || !caregiverMatch) {
        console.warn(
          '⚠️ Could not extract necessary fields from description:',
          descriptionText,
        );
        return;
      }

      // Extract parsed values
      let employeeName, caregiverName;
      let serviceDate = normalizeDate(serviceDateMatch[1]); // Normalize the date format

      if (employeeMatch[2])
        employeeName = `${employeeMatch[2].trim()} ${employeeMatch[1].trim()}`; // Convert to First Last
      else employeeName = employeeMatch[1].trim(); // "Firstname Lastname" (no conversion needed)

      if (caregiverMatch[2])
        caregiverName = `${caregiverMatch[2].trim()} ${caregiverMatch[1].trim()}`; // Convert to First Last
      else caregiverName = caregiverMatch[1].trim(); // "Firstname Lastname" (no conversion needed)

      // Find a match in the new object
      const matchedEntry = providerFunctions[providerName].matchedEntry(
        newDataObject,
        serviceDate,
        employeeName,
        caregiverName,
      );

      if (matchedEntry) {
        console.log(
          `✅ Match found! Updating row for: ${employeeName}, ${caregiverName}, ${serviceDate}`,
        );

        // Replace XXXXXX values with real data
        descriptionFieldText = providerFunctions[
          providerName
        ].descriptionFieldTextUpdate(descriptionFieldText, matchedEntry);

        // ✅ Simulate typing character by character
        await simulateTypingUsingKeyboard(
          descriptionField,
          descriptionFieldText,
        );

        // const proceed = confirm(
        //   "Do you want to continue processing the next row?"
        // );
        // if (!proceed) {
        //   console.warn("🚨 Processing stopped by user.");
        //   return; // Stops further row processing
        // }
      } else {
        console.warn(
          `⚠️ No match found for ${employeeName}, ${caregiverName}, ${serviceDate}`,
        );
      }
      //   });
    } catch (error) {
      console.error('❌ Error processing row:', error);
      continue; // Ensures the loop continues even if there's an error
    }
  }

  console.log('✅ All Description fields processed.');
}

async function fillInvoiceDetails() {
  const providerNameField = document.querySelector(
    'input[aria-label="Customer"], input[placeholder="Add customer"]',
  );
  const providerName = providerNameField?.value.trim();
  const data = providerData[providerName];

  if (!data) {
    console.warn(`⚠️ No preset data for provider: ${providerName}`);
    return;
  }

  const customerEmailField = document.querySelector(
    'input[aria-label="Cc/Bcc"], input[placeholder="Enter customer email"]',
  );

  if (customerEmailField.value === data.customerEmail) {
    console.log('This invoice has already been processed. Exiting!!');
    return -100;
  }

  const ccBccButton = document.querySelector('button[aria-label="Cc/Bcc"]');
  const billToField = document.querySelector(
    'textarea[aria-label="billToTextAreaLabel"]',
  );
  const termsField = document.querySelector(
    'input[aria-label="Select term"][data-testid="select_term__textField"][role="combobox"]',
  );
  const invoiceDateField = document.querySelector(
    'input[data-testid="txn_date"]',
  );
  const employeeNameField = document.querySelector(
    'input[aria-label="Text Field"]',
  );
  const locationField = document.querySelector(
    'input[aria-label="Dropdown Field"][role="combobox"][type="text"][placeholder=""]',
  );

  try {
    if (customerEmailField) {
      await simulateTypingUsingKeyboard(customerEmailField, data.customerEmail);
    } else {
      console.warn('❌ customerEmailField not found!');
    }

    if (ccBccButton) {
      await openAndFillCcDialog(ccBccButton, data.ccEmails);
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      console.warn('❌ ccBccButton not found!');
    }

    if (billToField) {
      await simulateTypingUsingKeyboard(billToField, data.billTo, false, 600);
    } else {
      console.warn('❌ billToField not found!');
    }

    if (termsField) {
      console.log('Entered into terms field!!');
      await selectDueOnReceipt(termsField, data.terms);
    } else {
      console.warn('❌ termsField not found!');
    }

    if (invoiceDateField) {
      let currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      await simulateTypingUsingKeyboard(
        invoiceDateField,
        currentDate,
        false,
        600,
      );
      // await blinkCursorInField(invoiceDateField);
      await focusCursorInField(invoiceDateField);
    } else {
      console.warn('❌ invoiceDateField not found!');
    }

    if (employeeNameField) {
      await simulateTypingUsingKeyboard(employeeNameField, data.employeeName);
    } else {
      console.warn('❌ employeeNameField not found!');
    }

    if (locationField) {
      await selectLocation(locationField, data.location);
    } else {
      console.warn('❌ locationField not found!');
    }

    console.log('🚀 All fields have been filled successfully!');
  } catch (error) {
    console.error('❌ Error while filling invoice details:', error);
  }

  await processInvoiceRows();
  console.log('✅ QuickBooks Invoice Table Auto-Fill completed successfully!');
}

async function selectProductService(cell, fieldIcon, value) {
  console.log('Entered into selectProductService function!!!');

  fieldIcon.closest('div').click();
  await new Promise((r) => setTimeout(r, 200));

  // Re-query element before second click
  const fieldIconRequeried = cell?.querySelector(
    "svg[class*='DropdownTypeahead-chevronIconWrapper']",
  );
  fieldIconRequeried.closest('div').click();

  const dropdownMenu = document.querySelector(
    'div[role="listbox"][class*="Menu-menu-list-wrapper"]',
  );
  await new Promise((r) => setTimeout(r, 2000));

  if (dropdownMenu) {
    // Select all <ul> elements representing options
    const options = dropdownMenu.querySelectorAll('ul[role="option"]');

    if (options.length > 0) {
      // Find the specific option for "Product/service"
      const productServiceOption = Array.from(options).find((option) => {
        const labelSpan = option.querySelector('span.rowTextLabel');
        return labelSpan && labelSpan.textContent.trim() === value;
      });

      if (productServiceOption) {
        console.log(`✅ Found '${value}'. Selecting...`);
        productServiceOption.click();
      } else {
        console.warn(`❌ '${value}' option not found.`);
      }
    } else {
      console.warn('❌ No options found in the dropdown.');
    }
  } else {
    console.warn('❌ Dropdown menu container not found.');
  }
}

function tabAction(field, tab = false) {
  if (tab) {
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    field.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Tab', bubbles: true }),
    );
    console.log('➡️ Tabbed to the next field.');
  }
}

function getDescriptionDataByProvider(data, fileArray) {
  const providerNameField = document.querySelector(
    'input[aria-label="Customer"], input[placeholder="Add customer"]',
  );
  const providerName = providerNameField?.value.trim();
  let pd = providerData[providerName];

  const bonusRaw = extractBonus(providerName, data, fileArray);
  const bonusAmount = parseFloat(bonusRaw?.replace(/[^0-9.]/g, ''));

  // const caseBonuses =
  //   providerFunctions[providerName].casesWithBonuses(fileArray);

  // TODO: Requested Start/End Time: ${extractTime(
  //   data.description
  // )} ... Needs to be updated for Care.com

  const providerByFormattedDescription = {
    'Care.com': function () {
      return `Service Date: ${data.serviceDate}\nEmployee Name: ${
        data.client
      }\nCaregiver: ${extractCaregiver(
        data.description,
      )}\nJob ID: ${extractJobID(
        providerName,
        data,
        fileArray,
      )}\nRequested Start/End Time: ${extractRequestedTime(
        providerName,
        data,
        fileArray,
      )}\nActual Start/End Time: ${extractTime(data.description)}`;
    },
    'Bright Horizons': function () {
      return `Service Date: ${data.serviceDate}\nEmployee Name: ${
        data.client
      }\nCaregiver: ${extractCaregiver(
        data.description,
      )}\nCase #: ${extractCaseID(
        providerName,
        data,
        fileArray,
      )}\nCare recipient count: ${recipientCount(
        providerName,
        data,
        fileArray,
      )}\nCare recipient name(s): ${recipientNames(
        providerName,
        data,
        fileArray,
      )}`;
    },
    'Care.com Adult Backup Care': function () {
      return `Service Date: ${data.serviceDate}\nEmployee Name: ${
        data.client
      }\nCaregiver: ${extractCaregiver(
        data.description,
      )}\nJob ID: ${extractJobID(
        providerName,
        data,
        fileArray,
      )}\nRequested Start/End Time: ${extractRequestedTime(
        providerName,
        data,
        fileArray,
      )}\nActual Start/End Time: ${extractTime(data.description)}`;
    },
  };
  pd.formattedDescription = providerByFormattedDescription[providerName]();

  return { pd, bonus: bonusAmount > 0 ? String(bonusAmount) : '' };
}

const providerFunctions = {
  'Care.com': {
    matchedEntry: function (
      newDataObject,
      serviceDate,
      employeeName,
      caregiverName,
    ) {
      return newDataObject.find(
        (entry) =>
          normalizeDate(entry['Date']) === serviceDate &&
          entry['Caregiver']?.toLowerCase() === caregiverName?.toLowerCase(),
      );
    },
    descriptionFieldTextUpdate: function (descriptionFieldText, matchedEntry) {
      return descriptionFieldText
        .replace(/Job ID:\s*XXXXXX__NF/, `Job ID: ${matchedEntry['Job ID']}`)
        .replace(
          /Requested Start\/End Time:\s*XXXXXX__NF/,
          `Requested Start/End Time: ${formatHours(
            matchedEntry['Hours (Local time)'],
          )}`,
        );
    },
    casesWithBonuses: function (data) {
      const caseBonusMap = new Map();

      data.forEach((entry) => {
        const jobID = entry?.['Job ID'];
        const bonusRaw = entry?.['Bonus']?.trim();

        // Check if bonus is a valid non-zero monetary value
        const bonusAmount = parseFloat(bonusRaw?.replace(/[^0-9.]/g, ''));

        if (bonusRaw && bonusAmount > 0 && !caseBonusMap.has(jobID)) {
          caseBonusMap.set(jobID, bonusRaw); // Preserve the original "$x.xx" format
        }
      });

      return caseBonusMap;
    },
    processCSV: function (csvText) {
      const rows = csvText
        .trim()
        .split('\n')
        .map((row) => row.split(','));
      const headers = rows.shift().map((header) => header.trim()); // Extract headers and remove from rows

      // Columns to keep
      const keepColumns = [
        'Job ID',
        'Date',
        'Hours (Local time)',
        'Caregiver',
        'Bonus',
        'Cancellation Date',
      ];

      // Map column indices based on headers
      const columnIndices = {};
      headers.forEach((header, index) => {
        if (keepColumns.includes(header)) {
          columnIndices[header] = index;
        }
      });

      // Group data
      // TODO Grouped data not needed for Care.com!! Remove this later!!
      const groupedData = {};

      rows.forEach((row) => {
        const key = [
          row[columnIndices['Job ID']] || '',
          row[columnIndices['Date']] || '',
          row[columnIndices['Hours (Local time)']] || '',
          row[columnIndices['Caregiver']] || '',
        ].join('|');

        const bonus = row[columnIndices['Bonus']] || '';
        const cancellationDate = row[columnIndices['Cancellation Date']] || '';

        if (!groupedData[key]) {
          groupedData[key] = {
            'Job ID': row[columnIndices['Job ID']],
            Date: row[columnIndices['Date']],
            'Hours (Local time)': row[columnIndices['Hours (Local time)']],
            Caregiver: row[columnIndices['Caregiver']],
            Bonus: bonus,
            'Cancellation Date': cancellationDate,
          };
        }
      });

      // Convert object into an array of grouped results
      const result = Object.values(groupedData);

      console.log('✅ Processed Data:');
      console.table(result);

      return result;
    },
  },
  'Bright Horizons': {
    matchedEntry: function (
      newDataObject,
      serviceDate,
      employeeName,
      caregiverName,
    ) {
      return newDataObject.find(
        (entry) =>
          normalizeDate(entry['Care Location Start Date/Time']) ===
            serviceDate &&
          entry['Employee Name']?.toLowerCase() ===
            employeeName?.toLowerCase() &&
          entry['Caregiver Name']?.toLowerCase() ===
            caregiverName?.toLowerCase(),
      );
    },
    descriptionFieldTextUpdate: function (descriptionFieldText, matchedEntry) {
      return descriptionFieldText
        .replace(
          /Case #:\s*XXXXXX__NF/,
          `Case #: ${matchedEntry['Case Number']}`,
        )
        .replace(
          /Care recipient count:\s*XXXXXX__NF/,
          `Care recipient count: ${
            matchedEntry['Care Recipient Names'].split(',').length
          }`,
        )
        .replace(
          /Care recipient name\(s\):\s*XXXXXX__NF/,
          `Care recipient name(s): ${matchedEntry['Care Recipient Names']}`,
        );
    },
    casesWithBonuses: function (_) {
      return new Map();
    },
    processCSV: function (csvText) {
      const rows = csvText
        .trim()
        .split('\n')
        .map((row) => row.split(','));
      const headers = rows.shift().map((header) => header.trim()); // Extract headers and remove from rows

      // Columns to keep
      const keepColumns = [
        'Care Location Start Date/Time',
        'Care Location End Date/Time',
        'Case Number',
        'Employee Name',
        'Caregiver Name',
        'Care Recipient Name',
      ];

      // Map column indices based on headers
      const columnIndices = {};
      headers.forEach((header, index) => {
        if (keepColumns.includes(header)) {
          columnIndices[header] = index;
        }
      });

      // Group data
      const groupedData = {};

      rows.forEach((row) => {
        const key = keepColumns
          .slice(0, 5) // Exclude "Care Recipient Name" from key
          .map((col) => row[columnIndices[col]]?.trim() || '')
          .join('|');

        const careRecipient =
          row[columnIndices['Care Recipient Name']]?.trim() || '';

        if (!groupedData[key]) {
          groupedData[key] = new Set();
        }

        if (careRecipient) {
          groupedData[key].add(careRecipient);
        }
      });

      // Convert sets to comma-separated strings
      const result = Object.entries(groupedData).map(([key, recipientsSet]) => {
        const recipients = Array.from(recipientsSet).join(', ');
        const [startDate, endDate, caseNumber, employeeName, caregiverName] =
          key.split('|');

        return {
          'Care Location Start Date/Time': startDate,
          'Care Location End Date/Time': endDate,
          'Case Number': caseNumber,
          'Employee Name': employeeName,
          'Caregiver Name': caregiverName,
          'Care Recipient Names': recipients,
        };
      });

      console.log('✅ Processed Data:');
      console.table(result);
      return result;
    },
  },
  'Care.com Adult Backup Care': {
    matchedEntry: function (
      newDataObject,
      serviceDate,
      employeeName,
      caregiverName,
    ) {
      return newDataObject.find(
        (entry) =>
          normalizeDate(entry['Date']) === serviceDate &&
          entry['Caregiver']?.toLowerCase() === caregiverName?.toLowerCase(),
      );
    },
    descriptionFieldTextUpdate: function (descriptionFieldText, matchedEntry) {
      return descriptionFieldText
        .replace(/Job ID:\s*XXXXXX__NF/, `Job ID: ${matchedEntry['Job ID']}`)
        .replace(
          /Requested Start\/End Time:\s*XXXXXX__NF/,
          `Requested Start/End Time: ${formatHours(
            matchedEntry['Hours (Local time)'],
          )}`,
        );
    },
    casesWithBonuses: function (data) {
      const caseBonusMap = new Map();

      data.forEach((entry) => {
        const jobID = entry?.['Job ID'];
        const bonusRaw = entry?.['Bonus']?.trim();

        // Check if bonus is a valid non-zero monetary value
        const bonusAmount = parseFloat(bonusRaw?.replace(/[^0-9.]/g, ''));

        if (bonusRaw && bonusAmount > 0 && !caseBonusMap.has(jobID)) {
          caseBonusMap.set(jobID, bonusRaw); // Preserve the original "$x.xx" format
        }
      });

      return caseBonusMap;
    },
    processCSV: function (csvText) {
      const rows = csvText
        .trim()
        .split('\n')
        .map((row) => row.split(','));
      const headers = rows.shift().map((header) => header.trim()); // Extract headers and remove from rows

      // Columns to keep
      const keepColumns = [
        'Job ID',
        'Date',
        'Hours (Local time)',
        'Caregiver',
        'Bonus',
        'Cancellation Date',
      ];

      // Map column indices based on headers
      const columnIndices = {};
      headers.forEach((header, index) => {
        if (keepColumns.includes(header)) {
          columnIndices[header] = index;
        }
      });

      // Group data
      // TODO Grouped data not needed for Care.com!! Remove this later!!
      const groupedData = {};

      rows.forEach((row) => {
        const key = [
          row[columnIndices['Job ID']] || '',
          row[columnIndices['Date']] || '',
          row[columnIndices['Hours (Local time)']] || '',
          row[columnIndices['Caregiver']] || '',
        ].join('|');

        const bonus = row[columnIndices['Bonus']] || '';
        const cancellationDate = row[columnIndices['Cancellation Date']] || '';

        if (!groupedData[key]) {
          groupedData[key] = {
            'Job ID': row[columnIndices['Job ID']],
            Date: row[columnIndices['Date']],
            'Hours (Local time)': row[columnIndices['Hours (Local time)']],
            Caregiver: row[columnIndices['Caregiver']],
            Bonus: bonus,
            'Cancellation Date': cancellationDate,
          };
        }
      });

      // Convert object into an array of grouped results
      const result = Object.values(groupedData);

      console.log('✅ Processed Data:');
      console.table(result);

      return result;
    },
  },
};

async function createNewBonusRow(data) {
  const table = document.querySelector('table[role="table"]');
  if (!table) {
    console.error('❌ Invoice table not found!');
    return;
  }

  // Extract headers to dynamically reference columns
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
    th.textContent.trim(),
  );

  const addButton = Array.from(
    document.querySelectorAll('button[type="button"]'),
  ).find((button) => button.textContent.trim() === 'Add product or service');

  if (addButton) {
    console.log('✅ Button found:', addButton);
    addButton.click(); // Perform the click action
  } else {
    console.warn('❌ Button not found!');
  }

  const newRow = Array.from(document.querySelectorAll('tbody tr'))
    .reverse()
    .find((row) => {
      const serviceDateField = row.querySelector(
        'input[aria-label*="Service date"]',
      );
      return serviceDateField && !serviceDateField.value;
    });

  const cells = Array.from(newRow.querySelectorAll('td'));

  const serviceDateField =
    cells[headers.indexOf('Service Date')]?.querySelector('input');
  await simulateTypingUsingKeyboard(
    serviceDateField,
    data.serviceDate,
    false,
    100,
  );

  const productServiceCell = cells[headers.indexOf('Product/service')];
  const productServiceFieldDropdownIcon = cells[
    headers.indexOf('Product/service')
  ]?.querySelector("svg[class*='DropdownTypeahead-chevronIconWrapper']");
  await selectProductService(
    productServiceCell,
    productServiceFieldDropdownIcon,
    data.productService,
  );

  const descriptionField =
    cells[headers.indexOf('Description')]?.querySelector('textarea');
  await simulateTypingUsingKeyboard(
    descriptionField,
    data.description,
    false,
    100,
  );

  const qtyField = cells[headers.indexOf('Qty')]?.querySelector('input');
  await simulateTypingUsingKeyboard(qtyField, data.qty, false, 100);

  const rateField = cells[headers.indexOf('Rate')]?.querySelector('input');
  await simulateTypingUsingKeyboard(rateField, data.rate, true, 100);
}

// Function to process invoice rows and add new entries dynamically
async function processInvoiceRows() {
  const table = document.querySelector('table[role="table"]');
  if (!table) {
    console.error('❌ Invoice table not found!');
    return;
  }

  // Extract headers to dynamically reference columns
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
    th.textContent.trim(),
  );

  const rows = table.querySelectorAll('tbody tr');

  let currentClient = '';
  let clientRows = [];
  let removeRows = [];

  for (let row of rows) {
    const cells = Array.from(row.querySelectorAll('td'));
    const descriptionIndex = headers.indexOf('Description');
    const descriptionCell =
      cells[descriptionIndex]?.querySelector('div, textarea');
    const descriptionText = descriptionCell?.textContent.trim();

    // if (
    //   !descriptionText.includes("XXXXXX__NF") &&
    //   descriptionText.includes("Service Date:")
    // ) {
    //   console.log("Skipping this row");
    //   continue;
    // }
    // if (!descriptionText) {
    //   console.log("Description field is empty. Stop everything!!");
    //   return; // Skip empty descriptions
    // }

    if (descriptionText?.startsWith('Client:')) {
      currentClient = descriptionText.replace('Client:', '').trim();
      removeRows.push({
        deleteField:
          cells[headers.indexOf('Class (hidden)') + 1]?.querySelector(
            'button, svg',
          ),
      });
    } else if (currentClient && descriptionText) {
      clientRows.push({
        client: currentClient,
        descriptionField:
          cells[headers.indexOf('Description')]?.querySelector('textarea'),
        description: descriptionText,
        serviceDateField:
          cells[headers.indexOf('Service Date')]?.querySelector('input'),
        serviceDate: extractServiceDate(descriptionText),
        productServiceCell: cells[headers.indexOf('Product/service')],
        productServiceFieldDropdownIcon: cells[
          headers.indexOf('Product/service')
        ]?.querySelector("svg[class*='DropdownTypeahead-chevronIconWrapper']"),
        productService: cells[headers.indexOf('Product/service')]
          ?.querySelector('input')
          ?.value.trim(),
        qtyField: cells[headers.indexOf('Qty')]?.querySelector('input'),
        qty: cells[headers.indexOf('Qty')]
          ?.querySelector('input')
          ?.value.trim(),
        rateField: cells[headers.indexOf('Rate')]?.querySelector('input'),
        rate: cells[headers.indexOf('Rate')]
          ?.querySelector('input')
          ?.value.trim(),
      });
    }
  }

  for (let data of clientRows) {
    await updateTableRow(data);
  }

  for (let data of removeRows) {
    await deleteTableRow(data);
  }

  // Create new bonus rows if exists. Does not allow the use of await so replacing it with the for loop!
  // bonusDataRows.forEach((entry) => {
  //   createNewBonusRow(entry);
  // });

  for (let data of bonusDataRows) {
    await createNewBonusRow(data);
  }

  // Save and close the current invoice
  await new Promise((r) => setTimeout(r, 2000));
  if (confirm('Do you want to save and close the invoice now?')) {
    saveAndCloseInvoice();
  } else {
    console.log('Invoice left unsaved.');
  }
}

// Helper function to extract the service date from the description
function extractServiceDate(description) {
  const dateMatch = description.match(/\d{2}\/\d{2}\/(\d{2}|\d{4})/);
  return dateMatch ? dateMatch[0] : '';
}

async function deleteTableRow(data) {
  const deleteRow = data.deleteField;
  if (deleteRow) {
    deleteRow.click();
    console.log('✅ Client row deleted succesfully!');
  } else {
    console.warn('⚠️ No delete button found for this row.');
  }
}

function casesWithBonuses(data) {
  const caseBonusMap = new Map();

  data.forEach((entry) => {
    const jobID = entry?.['Job ID'];
    const bonusRaw = entry?.['Bonus']?.trim();

    // Check if bonus is a valid non-zero monetary value
    const bonusAmount = parseFloat(bonusRaw?.replace(/[^0-9.]/g, ''));

    if (bonusRaw && bonusAmount > 0 && !caseBonusMap.has(jobID)) {
      caseBonusMap.set(jobID, bonusRaw); // Preserve the original "$x.xx" format
    }
  });

  return caseBonusMap;
}

//map.get("key") to get the value
//result is of the form: {'case1' => '50', 'case2' => '100'}
//result.get("case1") will give you 50
//result.get("case2") will give you 100

//const data = [
// {"Case Number": "case1", "Bonus": "50"},
// {"Case Number": "case2", "Bonus": "100"},
// {"Case Number": "case3", "Bonus": ""},
// ];

// Function to add new rows and update existing rows and fill in the data. New rows will only be added for Care.com bonus entries.
async function updateTableRow(data) {
  console.log('data: ', data);

  const csvArray = FILEARRAY;
  // const { prvData, caseBonuses } = getDescriptionDataByProvider(data, csvArray);
  const { pd: prvData, bonus } = getDescriptionDataByProvider(data, csvArray);
  console.log(prvData, bonus);

  // Fill Service Date
  const serviceDateField = data.serviceDateField;
  if (serviceDateField)
    await simulateTypingUsingKeyboard(
      serviceDateField,
      data.serviceDate,
      false,
    );

  // Fill Product/Service
  const productServiceFieldDropdownIcon = data.productServiceFieldDropdownIcon;
  const productServiceCell = data.productServiceCell;
  if (
    productServiceCell &&
    prvData.inaccurateProductServiceValue.includes(data.productService)
  ) {
    await selectProductService(
      productServiceCell,
      productServiceFieldDropdownIcon,
      prvData.correctProductServiceValue,
    );
  }

  // Fill Description
  const descriptionField = data.descriptionField;
  if (descriptionField) {
    const formattedDescription = prvData.formattedDescription;
    await simulateTypingUsingKeyboard(
      descriptionField,
      formattedDescription,
      false,
      100,
    );
  }

  // Fill Quantity
  const qtyField = data.qtyField;
  if (qtyField && data.qty)
    await simulateTypingUsingKeyboard(qtyField, data.qty, false);

  // Fill Rate
  const rateField = data.rateField;
  if (rateField && data.rate)
    await simulateTypingUsingKeyboard(rateField, data.rate, true);

  console.log(`✅ New row added for client: ${data.client}`);

  if (bonus) {
    bonusDataRows.push({
      serviceDate: data.serviceDate,
      productService: prvData.correctProductServiceValue,
      description: prvData.formattedDescription,
      qty: '1.00',
      rate: bonus,
    });
  }
  console.log(bonusDataRows);
}

function normalizeDate(dateString) {
  if (!dateString) return '';

  // Convert CSV date format "2/7/2025 4:30:00 PM" to "2/7/2025"
  let dateObj = new Date(dateString);
  if (isNaN(dateObj)) {
    console.warn(`⚠️ Invalid date encountered: ${dateString}`);
    return '';
  }
  return `${
    dateObj.getMonth() + 1
  }/${dateObj.getDate()}/${dateObj.getFullYear()}`;
}

// Helper function to extract caregiver from description
function extractCaregiver(description) {
  const parts = description.split(': ');
  return parts.length > 1 ? parts[1].split(' (')[0] : '';
}

function convertNameFormat(name, shouldConvert = true) {
  if (!shouldConvert) return name;

  const parts = name.split(',');
  if (parts.length === 2) {
    const lastName = parts[0].trim();
    const firstName = parts[1].trim();
    return `${firstName} ${lastName}`;
  }

  return name; // Return as-is if format is not "Lastname, Firstname"
}

function normalizeName(nameString) {
  if (!nameString) return '';

  // Convert "First Last" to "Last, First"
  const nameParts = nameString.trim().split(/\s+/);
  if (nameParts.length < 2) return nameString; // Return as-is if only one name

  return `${nameParts[1]} ${nameParts[0]}`; // Convert "Doe John" to "John Doe"
}

function extractJobID(providerName, data, fileArray) {
  const matchedEntry = providerFunctions[providerName].matchedEntry(
    fileArray,
    normalizeDate(data.serviceDate),
    convertNameFormat(data.client), // Not really used. Passing for consistency
    convertNameFormat(extractCaregiver(data.description)),
  );

  return matchedEntry?.['Job ID'] ?? 'XXXXXX__NF';
}

function extractBonus(providerName, data, fileArray) {
  const matchedEntry = providerFunctions[providerName].matchedEntry(
    fileArray,
    normalizeDate(data.serviceDate),
    convertNameFormat(data.client), // Not really used. Passing for consistency
    convertNameFormat(extractCaregiver(data.description)),
  );

  return matchedEntry?.['Bonus']?.trim() ?? '';
}

function extractCaseID(providerName, data, fileArray) {
  const matchedEntry = providerFunctions[providerName].matchedEntry(
    fileArray,
    normalizeDate(data.serviceDate),
    convertNameFormat(data.client),
    convertNameFormat(extractCaregiver(data.description)),
  );

  return matchedEntry?.['Case Number'] ?? 'XXXXXX__NF';
}

// Helper function to extract time from description
function extractTime(description) {
  const timeMatch = description.match(
    /\d{1,2}:\d{2}(am|pm)-\d{1,2}:\d{2}(am|pm)/,
  );
  return timeMatch ? timeMatch[0] : '';
}

function formatHours(input) {
  return input
    .replace(/\b0(\d:)/g, '$1') // Remove leading zero from hours (e.g., "04:00pm" → "4:00pm")
    .replace(/\s*-\s*/g, '-') // Remove spaces around the dash
    .replace(/\s*\(.*?\)$/, ''); // Remove anything in parentheses at the end
}

function extractRequestedTime(providerName, data, fileArray) {
  const matchedEntry = providerFunctions[providerName].matchedEntry(
    fileArray,
    normalizeDate(data.serviceDate),
    convertNameFormat(data.client), // Not really used. Passing for consistency
    convertNameFormat(extractCaregiver(data.description)),
  );

  return formatHours(matchedEntry?.['Hours (Local time)'] ?? 'XXXXXX__NF');
}

function getProviderName() {
  const providerNameField = document.querySelector(
    'input[aria-label="Customer"], input[placeholder="Add customer"]',
  );
  const providerName = providerNameField?.value.trim();
  return providerName;
}

async function selectAndProcessCSVFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';

    input.addEventListener('change', function (event) {
      const file = event.target.files[0];
      if (!file) {
        console.error('❌ No file selected.');
        reject('No file selected.');
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        const csvText = e.target.result;

        try {
          const result =
            providerFunctions[getProviderName()].processCSV(csvText);
          if (Array.isArray(result)) {
            resolve(result); // 🎯 Return the array
          } else {
            console.error('❌ Error: Processed CSV data is not an array.');
            reject('Processed data is not an array.');
          }
        } catch (err) {
          console.error('❌ Error processing CSV:', err);
          reject(err);
        }
      };

      reader.readAsText(file);
    });

    // Trigger file picker
    input.click();
  });
}

async function processFileContent(fileContent) {
  return new Promise((resolve, reject) => {
    try {
      const result =
        providerFunctions[getProviderName()].processCSV(fileContent);
      if (Array.isArray(result)) {
        resolve(result); // 🎯 Return the array
      } else {
        console.error('❌ Error: Processed CSV data is not an array.');
        reject('Processed data is not an array.');
      }
    } catch (err) {
      console.error('❌ Error processing CSV:', err);
      reject(err);
    }
  });
}

window.FUNCTION_PLACEHOLDER = async function invoiceAutoFill(fileContent) {
  'use strict';

  if (DEBUGME) debugger;
  FILEARRAY = await processFileContent(fileContent);
  console.log(FILEARRAY);

  try {
    const result = await fillInvoiceDetails();
    console.log('✅ QuickBooks Invoice Auto-Fill completed successfully!');

    if (result === -100) {
      if (Array.isArray(FILEARRAY)) {
        await updateDescriptionFields(FILEARRAY); // Now result is an array!
      } else {
        console.error('❌ Error: Processed CSV data is not an array.');
      }
    }

    // await processInvoiceRows();
    // console.log(
    //   "✅ QuickBooks Invoice Table Auto-Fill completed successfully!"
    // );
  } catch (error) {
    console.error('❌ Error in QuickBooks Invoice Table Auto-Fill:', error);
  }
};
