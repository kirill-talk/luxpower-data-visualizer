const axios = require('axios');
const querystring = require('querystring');

class LuxpowerClient {
  constructor(baseUrl = 'https://eu.luxpowertek.com') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cookie = null;
    this.account = null;
    this.password = null;
    this.deviceInfo = null;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    });
  }

  getHeaders(customCookie = null) {
    const headers = {};
    const cookieToUse = customCookie || this.cookie;
    if (cookieToUse) {
      headers['Cookie'] = cookieToUse;
    }
    return headers;
  }

  async login(account, password) {
    this.account = account;
    this.password = password;

    const res = await this.client.post('/WManage/web/login', querystring.stringify({
      account,
      password,
    }), {
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const setCookies = res.headers['set-cookie'];
    if (setCookies) {
      this.cookie = setCookies.map(c => c.split(';')[0]).join('; ');
    }

    // Call api/login as well to obtain structured user and plant metadata
    try {
      const apiRes = await this.client.post('/WManage/api/login', querystring.stringify({
        account,
        password,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          ...this.getHeaders(),
        },
      });
      if (apiRes.data && apiRes.data.success) {
        this.deviceInfo = {
          userVisitRecord: apiRes.data.userVisitRecord,
          plants: apiRes.data.plants,
          username: apiRes.data.username,
        };
      }
    } catch (e) {
      console.warn('API metadata fetch warning:', e.message);
    }

    return {
      cookie: this.cookie,
      deviceInfo: this.deviceInfo,
    };
  }

  async ensureAuth() {
    if (!this.cookie && this.account && this.password) {
      await this.login(this.account, this.password);
    }
  }

  // Wrapper for requests that automatically re-authenticates on session expiration
  async requestWithAuth(fn, customCookie = null) {
    if (!customCookie) {
      await this.ensureAuth();
    }
    try {
      const res = await fn();
      // If table endpoint redirects to login HTML
      if (typeof res === 'string' && res.includes('<!DOCTYPE')) {
        if (!customCookie && this.account && this.password) {
          console.log('🔄 Session expired (HTML login redirect detected). Re-authenticating...');
          await this.login(this.account, this.password);
          const retryRes = await fn();
          if (typeof retryRes === 'string' && retryRes.includes('<!DOCTYPE')) {
            throw new Error('UNLOGIN_ERROR');
          }
          return retryRes;
        }
        const err = new Error('Session expired');
        err.status = 401;
        throw err;
      }
      return res;
    } catch (err) {
      const isAuthError = err.status === 401 ||
        err.response?.status === 401 ||
        err.response?.data?.msg === 'UNLOGIN_ERROR';

      if (isAuthError) {
        if (!customCookie && this.account && this.password) {
          console.log('🔄 Session expired (401 / UNLOGIN_ERROR). Re-authenticating...');
          await this.login(this.account, this.password);
          return await fn();
        }
        const authErr = new Error('Session expired or unauthorized');
        authErr.status = 401;
        throw authErr;
      }
      throw err;
    }
  }

  async getInverterRuntime(serialNum, customCookie = null) {
    return this.requestWithAuth(async () => {
      const res = await this.client.post('/WManage/api/inverter/getInverterRuntime', querystring.stringify({
        serialNum,
      }), {
        headers: {
          ...this.getHeaders(customCookie),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      });
      return res.data;
    }, customCookie);
  }

  async getDayChart(serialNum, dateText, customCookie = null) {
    return this.requestWithAuth(async () => {
      const res = await this.client.post('/WManage/api/analyze/chart/dayMultiLine', querystring.stringify({
        serialNum,
        dateText,
      }), {
        headers: {
          ...this.getHeaders(customCookie),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      });
      return res.data;
    }, customCookie);
  }

  async getDayDataTable(serialNum, dateText, page = 1, rows = 300, customCookie = null) {
    return this.requestWithAuth(async () => {
      const endpoint = `/WManage/web/analyze/data/${dateText}?serialNum=${serialNum}&page=${page}&rows=${rows}`;
      const res = await this.client.post(endpoint, {}, {
        headers: {
          ...this.getHeaders(customCookie),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      });
      return res.data;
    }, customCookie);
  }
}

module.exports = LuxpowerClient;
