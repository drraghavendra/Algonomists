
## SDK Deployment Scripts

### `agent-sdk/scripts/deploy.js`
```javascript
const { execSync } = require('child_process');

console.log('Building Agent SDK...');
execSync('npm run build', { stdio: 'inherit' });

console.log('Running tests...');
execSync('npm test', { stdio: 'inherit' });

console.log('Publishing to npm...');
execSync('npm publish --access public', { stdio: 'inherit' });

console.log('Agent SDK deployed successfully!');
