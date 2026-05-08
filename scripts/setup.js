/**
 * 🚀 One-time setup script for BDS FFmpeg Server
 * Run with: node scripts/setup.js
 */

import fs from 'fs/promises';
import { execSync } from 'child_process';
import { generateApiKey } from '../config/security.js';

async function setup() {
  console.log('🎬 BDS FFmpeg Server - Setup Wizard\n');
  
  // 1. Check Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (major < 18) {
    console.error('❌ Node.js 18+ required. Current:', nodeVersion);
    process.exit(1);
  }
  console.log(`✅ Node.js ${nodeVersion} detected`);
  
  // 2. Install dependencies
  console.log('\n📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed');
  } catch (error) {
    console.error('❌ Failed to install dependencies');
    process.exit(1);
  }
  
  // 3. Create .env if not exists
  if (!await fileExists('.env')) {
    console.log('\n🔐 Creating .env from template...');
    await fs.copyFile('.env.example', '.env');
    
    // Generate API key
    const apiKey = generateApiKey(40);
    console.log(`✨ Generated API key: ${apiKey}`);
    console.log('⚠️  Save this key securely - it won\'t be shown again!');
    
    // Update .env with generated key
    let envContent = await fs.readFile('.env', 'utf8');
    envContent = envContent.replace(
      'API_SECRET_KEY=your_super_secret_api_key_min_32_chars_here',
      `API_SECRET_KEY=${apiKey}`
    );
    await fs.writeFile('.env', envContent);
    
    console.log('✅ .env created with generated API key');  } else {
    console.log('✅ .env already exists');
  }
  
  // 4. Create directories
  console.log('\n📁 Creating directories...');
  const dirs = ['./uploads', './outputs', './logs'];
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/.gitkeep`, '');
  }
  console.log('✅ Directories created');
  
  // 5. Verify FFmpeg
  console.log('\n🎬 Verifying FFmpeg...');
  try {
    const version = execSync('npx ffmpeg-static --version', { encoding: 'utf8' });
    console.log(`✅ FFmpeg ready: ${version.trim().split('\n')[0]}`);
  } catch (error) {
    console.warn('⚠️  FFmpeg verification skipped (may work on deploy)');
  }
  
  // 6. Final instructions
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 SETUP COMPLETE!');
  console.log('═'.repeat(60));
  console.log(`
Next steps:

1️⃣  Review .env file and adjust settings if needed
2️⃣  Start development server:
    $ npm run dev
    
3️⃣  Test health endpoint:
    $ curl http://localhost:4000/api/ffmpeg/health
    
4️⃣  Test processing (with API key from .env):
    $ curl -X POST http://localhost:4000/api/ffmpeg/process \\
      -H "x-api-key: YOUR_API_KEY" \\
      -F "file=@test.mp4" \\
      -F "volume=1.2"

📚 Documentation:
    • API docs: See README.md
    • Troubleshooting: See docs/TROUBLESHOOTING.md

🚀 Deploy to Render:
    1. Push code to GitHub
    2. Connect repo at render.com
    3. Add environment variables from .env    4. Deploy!

🔐 Security reminder:
    • Never commit .env to version control
    • Rotate API_SECRET_KEY periodically
    • Use HTTPS in production
`);
}

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

setup().catch(console.error);
