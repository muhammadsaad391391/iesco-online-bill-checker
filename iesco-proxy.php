<?php
// iesco-proxy.php 
// Native WordPress proxy to fetch IESCO Bills directly using your server's IP address.

header("Access-Control-Allow-Origin: *");
header("Content-Type: text/html; charset=UTF-8");

// Set a 15-second timeout to prevent locking up your WordPress server if PITC is down
$timeout = 15;

$refNo = isset($_GET['refNo']) ? preg_replace('/\D/', '', $_GET['refNo']) : '';
$searchType = isset($_GET['searchType']) ? $_GET['searchType'] : 'refno';

$reqLength = ($searchType === 'customerid') ? 10 : 14;

if (strlen($refNo) !== $reqLength) {
    die("Error: Search parameter must be exactly $reqLength digits. Please go back and try again.");
}

$url = "https://bill.pitc.com.pk/iescobill";

// Function to cleanly execute cURL
function makeCurlRequest($url, $method = 'GET', $postData = null, $cookies = '') {
    global $timeout;
    $ch = curl_init();
    
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true); // We need headers to extract cookies
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Ignore strict SSL issues on some hosts
    curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    if ($cookies) {
        curl_setopt($ch, CURLOPT_COOKIE, $cookies);
    }

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/x-www-form-urlencoded"]);
    }

    $response = curl_exec($ch);
    $error = curl_error($ch);
    
    if ($error) {
        die("<strong>Connection Error:</strong> Our server couldn't connect to PITC within $timeout seconds. The official utility site might be down. Detail: $error");
    }

    $header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $headerStr = substr($response, 0, $header_size);
    $body = substr($response, $header_size);
    
    curl_close($ch);
    
    return ['headers' => $headerStr, 'body' => $body];
}

// 1. GET Request to fetch Tokens and Session Cookies
$initRes = makeCurlRequest($url, 'GET');

// Extract ASP.NET Tokens
preg_match('/name="__VIEWSTATE" id="__VIEWSTATE" value="(.*?)"/', $initRes['body'], $vsMatch);
preg_match('/name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="(.*?)"/', $initRes['body'], $vsgMatch);
preg_match('/name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="(.*?)"/', $initRes['body'], $evMatch);
preg_match('/name="__RequestVerificationToken" type="hidden" value="(.*?)"/', $initRes['body'], $rvtMatch);

if (empty($vsMatch) || empty($evMatch)) {
    die("<strong>Scraper Blocked:</strong> PITC failed to return verification tokens. They might have updated their security or your server IP is flagged.");
}

// Extract cookies carefully from headers
$cookiesArray = [];
preg_match_all('/^Set-Cookie:\s*([^;]*)/mi', $initRes['headers'], $cookieMatches);
if (!empty($cookieMatches[1])) {
    foreach ($cookieMatches[1] as $c) {
        $cookiesArray[] = trim($c);
    }
}
$cookieString = implode('; ', $cookiesArray);

// 2. Prepare POST Body
$rbSearchByList = ($searchType === 'customerid') ? 'appno' : 'refno';

$postData = [
    '__VIEWSTATE' => $vsMatch[1],
    '__VIEWSTATEGENERATOR' => isset($vsgMatch[1]) ? $vsgMatch[1] : "2CDA38AB",
    '__EVENTVALIDATION' => $evMatch[1],
    'rbSearchByList' => $rbSearchByList,
    'searchTextBox' => $refNo,
    'ruCodeTextBox' => '', // PITC requirement
    'btnSearch' => 'Search'
];

if (!empty($rvtMatch[1])) {
    $postData['__RequestVerificationToken'] = $rvtMatch[1];
}

// 3. POST Request for the Bill
$finalRes = makeCurlRequest($url, 'POST', $postData, $cookieString);
$billHtml = $finalRes['body'];

// 4. Inject <base> tag so PITC images and CSS load correctly
if (strpos($billHtml, '<head>') !== false) {
    $billHtml = str_replace('<head>', '<head><base href="https://bill.pitc.com.pk/">', $billHtml);
} else {
    $billHtml = '<head><base href="https://bill.pitc.com.pk/"></head>' . $billHtml;
}

// Output final bill directly to browser
echo $billHtml;
?>
