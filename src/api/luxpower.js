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

  async getInverterRuntime(serialNum, customCookie = null) {
    if (!customCookie) await this.ensureAuth();
    const res = await this.client.post('/WManage/api/inverter/getInverterRuntime', querystring.stringify({
      serialNum,
    }), {
      headers: {
        ...this.getHeaders(customCookie),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });
    return res.data;
  }

  async getDayChart(serialNum, dateText, customCookie = null) {
    if (!customCookie) await this.ensureAuth();
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
  }

  async getDayDataTable(serialNum, dateText, page = 1, rows = 300, customCookie = null) {
    if (!customCookie) await this.ensureAuth();
    const endpoint = `/WManage/web/analyze/data/${dateText}?serialNum=${serialNum}&page=${page}&rows=${rows}`;
    const res = await this.client.post(endpoint, {}, {
      headers: {
        ...this.getHeaders(customCookie),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });
    return res.data;
  }
}

module.exports = LuxpowerClient;
