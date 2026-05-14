/**
 * External integrations and shared infra helpers.
 */

const NUTRITION_MASTER_CACHE_KEY = 'NUTRITION_MASTER_CACHE';
const SCRIPT_PROPERTY_SPREADSHEET_ID = 'SPREADSHEET_ID';
const SCRIPT_PROPERTY_LIFF_ID = 'LIFF_ID';
const SCRIPT_PROPERTY_LINE_CHANNEL_ID = 'LINE_CHANNEL_ID';
const SCRIPT_PROPERTY_LINE_CHANNEL_ACCESS_TOKEN = 'LINE_CHANNEL_ACCESS_TOKEN';
const SCRIPT_PROPERTY_WEBAPP_URL = 'WEBAPP_URL';
const SCRIPT_PROPERTY_ADMIN_USER_IDS = 'ADMIN_USER_IDS';
const SCRIPT_PROPERTY_AUTO_APPROVE_USER_IDS = 'AUTO_APPROVE_USER_IDS';
const SCRIPT_PROPERTY_DRIVE_FOLDER_ID = 'DRIVE_FOLDER_ID';

function refreshNutritionMasterCache_() {
  CacheService.getScriptCache().remove(NUTRITION_MASTER_CACHE_KEY);
}

function getNutritionMasterCached() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(NUTRITION_MASTER_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  const masters = getNutritionMasters();
  cache.put(NUTRITION_MASTER_CACHE_KEY, JSON.stringify(masters), 600);
  return masters;
}

function getNutritionMasterByKey_(masterKey) {
  if (!masterKey) return null;
  return getNutritionMasterCached().find(master => master.masterKey === masterKey) || null;
}

function getSpreadsheetId_() {
  return PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_SPREADSHEET_ID) || '';
}

function setSpreadsheetId(spreadsheetId) {
  PropertiesService.getScriptProperties()
    .setProperty(SCRIPT_PROPERTY_SPREADSHEET_ID, String(spreadsheetId || '').trim());
}

function getSpreadsheet_() {
  const spreadsheetId = getSpreadsheetId_();
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  const active = SpreadsheetApp.getActive();
  if (active) {
    setSpreadsheetId(active.getId());
    return active;
  }

  throw new Error('SPREADSHEET_ID is not configured');
}

function getLiffId_() {
  return PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_LIFF_ID) || '';
}

function setLiffId(liffId) {
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_LIFF_ID, String(liffId || '').trim());
}

function getLineChannelId_() {
  return PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_LINE_CHANNEL_ID) || '';
}

function setLineChannelId(channelId) {
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_LINE_CHANNEL_ID, String(channelId || '').trim());
}

function getLineChannelAccessToken_() {
  return PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_LINE_CHANNEL_ACCESS_TOKEN) || '';
}

function setLineChannelAccessToken(accessToken) {
  PropertiesService.getScriptProperties()
    .setProperty(SCRIPT_PROPERTY_LINE_CHANNEL_ACCESS_TOKEN, String(accessToken || '').trim());
}

function getWebAppUrl_() {
  return (
    PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_WEBAPP_URL) ||
    ScriptApp.getService().getUrl() ||
    ''
  );
}

function setWebAppUrl(webAppUrl) {
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_WEBAPP_URL, String(webAppUrl || '').trim());
}

function getAdminUserIds_() {
  return getCsvScriptPropertyValues_(SCRIPT_PROPERTY_ADMIN_USER_IDS);
}

function setAdminUserIds(userIds) {
  setCsvScriptPropertyValues_(SCRIPT_PROPERTY_ADMIN_USER_IDS, userIds);
}

function getAutoApproveUserIds_() {
  return getCsvScriptPropertyValues_(SCRIPT_PROPERTY_AUTO_APPROVE_USER_IDS);
}

function setAutoApproveUserIds(userIds) {
  setCsvScriptPropertyValues_(SCRIPT_PROPERTY_AUTO_APPROVE_USER_IDS, userIds);
}

function getCsvScriptPropertyValues_(propertyKey) {
  return String(PropertiesService.getScriptProperties().getProperty(propertyKey) || '')
    .split(',')
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function setCsvScriptPropertyValues_(propertyKey, values) {
  const normalized = Array.isArray(values)
    ? values
    : String(values || '').split(',');
  const deduped = [...new Set(normalized.map(value => String(value || '').trim()).filter(Boolean))];
  PropertiesService.getScriptProperties().setProperty(propertyKey, deduped.join(','));
}

function getDriveFolderId_() {
  return PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_DRIVE_FOLDER_ID) || '';
}

function setDriveFolderId(folderId) {
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_DRIVE_FOLDER_ID, String(folderId || '').trim());
}

function configureLiff(liffId, channelId, accessToken, webAppUrl) {
  if (liffId != null) {
    setLiffId(liffId);
  }

  if (channelId != null) {
    setLineChannelId(channelId);
  }

  if (accessToken != null) {
    setLineChannelAccessToken(accessToken);
  }

  if (webAppUrl != null) {
    setWebAppUrl(webAppUrl);
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function textOutput_(text) {
  return ContentService
    .createTextOutput(String(text || 'ok'))
    .setMimeType(ContentService.MimeType.TEXT);
}

function verifyLiffIdentity_(payload) {
  const idToken = String(payload && payload.idToken || '').trim();
  const channelId = getLineChannelId_();
  const fallbackIdentity = {
    userId: String(payload && payload.userId || '').trim(),
    displayName: String(payload && payload.displayName || '').trim(),
    verified: false,
    verificationError: '',
  };

  if (!idToken || !channelId) {
    fallbackIdentity.verificationError = !idToken
      ? 'idToken is not available'
      : 'LINE channel ID is not configured';
    return fallbackIdentity;
  }

  const response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: {
      id_token: idToken,
      client_id: channelId,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    fallbackIdentity.verificationError =
      extractLineVerifyError_(response.getContentText()) ||
      `LINE verify failed with status ${response.getResponseCode()}`;
    return fallbackIdentity;
  }

  const verified = JSON.parse(response.getContentText());
  return {
    userId: String(verified.sub || ''),
    displayName: String(verified.name || payload.displayName || ''),
    verified: true,
    verificationError: '',
  };
}

function extractLineVerifyError_(body) {
  if (!body) return '';

  try {
    const parsed = JSON.parse(body);
    return String(parsed.error_description || parsed.error || '').trim();
  } catch (error) {
    return String(body || '').trim();
  }
}

function callLineApi_(path, method, payload) {
  const accessToken = getLineChannelAccessToken_();
  if (!accessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  const options = {
    method: method || 'get',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    muteHttpExceptions: true,
  };

  if (payload != null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(`https://api.line.me${path}`, options);
  const statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`LINE API error ${statusCode}: ${response.getContentText()}`);
  }

  const body = response.getContentText();
  return body ? JSON.parse(body) : {};
}

function replyLineMessages_(replyToken, messages) {
  if (!replyToken || !messages || !messages.length) return;
  callLineApi_('/v2/bot/message/reply', 'post', {
    replyToken: replyToken,
    messages: messages,
  });
}

function pushLineMessages_(userId, messages) {
  if (!userId || !messages || !messages.length) return;
  callLineApi_('/v2/bot/message/push', 'post', {
    to: userId,
    messages: messages,
  });
}

function fetchLineMessageContentBlob_(messageId) {
  const accessToken = getLineChannelAccessToken_();
  if (!accessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }
  const response = UrlFetchApp.fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    method: 'get',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(`LINE content API error ${response.getResponseCode()}: ${response.getContentText()}`);
  }
  return response.getBlob();
}

function saveLineImageToDrive_(blob, fileName) {
  const folderId = getDriveFolderId_();
  const targetFileName = String(fileName || '').trim() || `line-image-${Utilities.getUuid()}`;
  const driveFile = folderId
    ? DriveApp.getFolderById(folderId).createFile(blob.setName(targetFileName))
    : DriveApp.createFile(blob.setName(targetFileName));
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    fileId: driveFile.getId(),
    url: driveFile.getUrl(),
    name: driveFile.getName(),
  };
}

function showLineLoadingAnimation_(chatId, loadingSeconds) {
  if (!chatId) return;
  callLineApi_('/v2/bot/chat/loading/start', 'post', {
    chatId: chatId,
    loadingSeconds: normalizeLoadingSeconds_(loadingSeconds),
  });
}

function normalizeLoadingSeconds_(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds)) return 5;
  return Math.max(5, Math.min(60, Math.round(seconds)));
}

function getLineProfile_(userId) {
  if (!userId || !getLineChannelAccessToken_()) return null;
  return callLineApi_(`/v2/bot/profile/${encodeURIComponent(userId)}`, 'get');
}

function buildLiffUrl_(params) {
  const query = buildQueryString_(params || {});
  const liffId = getLiffId_();
  if (liffId) {
    return `https://liff.line.me/${encodeURIComponent(liffId)}${query ? `?${query}` : ''}`;
  }

  const webAppUrl = getWebAppUrl_();
  return webAppUrl ? `${webAppUrl}${query ? `?${query}` : ''}` : '';
}

function buildQueryString_(params) {
  return Object.keys(params)
    .filter(key => params[key] != null && String(params[key]).trim() !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&');
}

function parseQueryString_(value) {
  return String(value || '')
    .split('&')
    .filter(Boolean)
    .reduce((acc, pair) => {
      const delimiterIndex = pair.indexOf('=');
      const rawKey = delimiterIndex >= 0 ? pair.slice(0, delimiterIndex) : pair;
      const rawValue = delimiterIndex >= 0 ? pair.slice(delimiterIndex + 1) : '';
      acc[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
      return acc;
    }, {});
}
