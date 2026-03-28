const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
// Render assigns dynamic ports via process.env.PORT
const port = process.env.PORT || 3000;

app.use(cors());
// Serve the beautiful frontend natively
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/api/bill', async (req, res) => {
    let { refNo } = req.query;
    if (!refNo) return res.status(400).send("Please provide a 14-digit reference number or 10-digit customer ID.");
    
    refNo = refNo.replace(/\D/g, '');
    const searchType = req.query.searchType || 'refno';
    const reqLength = searchType === 'customerid' ? 10 : 14;

    if (refNo.length !== reqLength) return res.status(400).send(`Search parameter must be exactly ${reqLength} digits.`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 sec timeout

        // 1. GET Tokens
        const initRes = await fetch("https://bill.pitc.com.pk/iescobill", { signal: controller.signal });
        const initText = await initRes.text();
        clearTimeout(timeoutId);
        
        // Extract Cookies
        const setCookieHeader = initRes.headers.get('set-cookie');
        let cookieString = "";
        if (setCookieHeader) {
            cookieString = Array.isArray(setCookieHeader) 
                ? setCookieHeader.map(c => c.split(';')[0]).join('; ') 
                : setCookieHeader.split(',').map(c => c.split(';')[0]).join('; ');
        } else if (initRes.headers.getSetCookie) {
            const cookies = initRes.headers.getSetCookie();
            cookieString = cookies.map(c => c.split(';')[0]).join('; ');
        }

        const vsMatch = initText.match(/name="__VIEWSTATE" id="__VIEWSTATE" value="(.*?)"/);
        const vsgMatch = initText.match(/name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="(.*?)"/);
        const evMatch = initText.match(/name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="(.*?)"/);
        const rvtMatch = initText.match(/name="__RequestVerificationToken" type="hidden" value="(.*?)"/);

        if (!vsMatch || !evMatch) return res.status(500).send("Failed to initiate connection with IESCO portal.");

        // 2. POST
        const params = new URLSearchParams();
        params.append('__VIEWSTATE', vsMatch[1]);
        params.append('__VIEWSTATEGENERATOR', vsgMatch?.[1] || "2CDA38AB");
        params.append('__EVENTVALIDATION', evMatch[1]);
        if (rvtMatch) params.append('__RequestVerificationToken', rvtMatch[1]);
        
        let rbSearchByList = req.query.searchType === 'customerid' ? 'appno' : 'refno';
        params.append('rbSearchByList', rbSearchByList);
        params.append('searchTextBox', refNo);
        params.append('ruCodeTextBox', '');
        params.append('btnSearch', 'Search');

        const postController = new AbortController();
        const postTimeoutId = setTimeout(() => postController.abort(), 8000);

        const postRes = await fetch("https://bill.pitc.com.pk/iescobill", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": "https://bill.pitc.com.pk/iescobill",
                "Cookie": cookieString,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0"
            },
            body: params.toString(),
            redirect: 'follow',
            signal: postController.signal
        });
        clearTimeout(postTimeoutId);

        let billHtml = await postRes.text();

        // 3. Fix missing static assets by injecting base href
        if (billHtml.includes('<head>')) {
            billHtml = billHtml.replace('<head>', '<head><base href="https://bill.pitc.com.pk/">');
        } else {
             billHtml = `<head><base href="https://bill.pitc.com.pk/"></head>` + billHtml;
        }

        res.send(billHtml);
    } catch (err) {
        if (err.name === 'AbortError' || (err.message && err.message.includes('abort'))) {
            return res.status(504).send(`
                <strong>Connection Blocked by PITC Firewall!</strong><br><br>
                The official IESCO server is aggressively rejecting traffic from this server's IP address.
                Please migrate to a residential proxy or try a different hosting provider!
            `);
        }
        res.status(500).send("Internal server error fetching the bill. Please try again later.");
    }
});

app.listen(port, () => {
    console.log(`[IESCO API] Proxy Server running on port ${port}`);
});
