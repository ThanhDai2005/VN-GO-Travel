require('dotenv').config({ path: 'backend/.env' });
const express = require('express');
const app = require('../src/app');

// Initialize the router if it's not already
app.handle({ url: '/', method: 'GET' }, { on: () => {}, end: () => {} }, () => {});

function listRoutes(app) {
    const routes = [];
    app._router.stack.forEach(middleware => {
        if (middleware.route) {
            // routes registered directly on the app
            routes.push(`${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
        } else if (middleware.name === 'router') {
            // router middleware
            const parentPath = middleware.regexp.source
                .replace('\\/', '/')
                .replace('^', '')
                .replace('\\/?(?=\\/|$)', '')
                .replace('(?=\\/|$)', '');
            
            middleware.handle.stack.forEach(handler => {
                if (handler.route) {
                    const path = handler.route.path;
                    const methods = Object.keys(handler.route.methods);
                    routes.push(`${methods.join(',').toUpperCase()} ${parentPath}${path}`);
                }
            });
        }
    });
    return routes;
}

const allRoutes = listRoutes(app);
console.log('--- REGISTERED ROUTES ---');
allRoutes.forEach(r => console.log(r));

const scanRoute = allRoutes.find(r => r.includes('/zones/scan'));
if (scanRoute) {
    console.log(`\n✅ Found scan route: ${scanRoute}`);
} else {
    console.error('\n❌ Could NOT find scan route!');
}

process.exit(0);
