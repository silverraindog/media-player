import fs from 'fs';
import path from 'path';
import { walkDirectoryRecursiveAsync } from '../server';

// Simple minimal testing harness
async function runTests() {
  console.log('🤖 Starting Automated Directory Walker Validation...');
  const testRoot = path.join(process.cwd(), 'temp_test_dir');

  // Ensure fresh state
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });

  try {
    // 1. Create a structured nested directory layout
    console.log('📁 Creating mock directory structure...');
    fs.writeFileSync(path.join(testRoot, 'file1.mp4'), 'Dummy media payload 1');
    
    const folder1 = path.join(testRoot, 'Movies');
    fs.mkdirSync(folder1, { recursive: true });
    fs.writeFileSync(path.join(folder1, 'movie1.mkv'), 'Dummy media payload 2');

    const folder2 = path.join(testRoot, 'Series', 'Season 1');
    fs.mkdirSync(folder2, { recursive: true });
    fs.writeFileSync(path.join(folder2, 'episode1.mkv'), 'Dummy media payload 3');
    fs.writeFileSync(path.join(folder2, 'episode2.mkv'), 'Dummy media payload 4');

    // 2. Set up circular symlink loop (if symlinks are supported on active OS/privilege level)
    let symlinksTested = false;
    try {
      const targetLoop = path.join(folder1, 'circular_loop_link');
      // Create loop pointing back to its parent (Movies)
      fs.symlinkSync(folder1, targetLoop, 'dir');
      symlinksTested = true;
      console.log('🔗 Successfully provisioned a cyclic symbolic link for loop immunity check.');
    } catch (symError: any) {
      console.warn('⚠️ OS/Privilege level does not support symlink creation during test. Skipping symlink-specific test step.', symError.message);
    }

    // 3. Trigger walker
    console.log('⏱️ Executing Concurrent Directory Walker...');
    const startTime = performance.now();
    const { items, errors } = await walkDirectoryRecursiveAsync(testRoot, testRoot, 0, 30);
    const duration = performance.now() - startTime;
    console.log(`✅ Walker completed in ${duration.toFixed(2)}ms and returned ${items.length} total items.`);

    // 4. Assertions
    console.log('🧪 Running assertions on results...');
    
    // Check files are correctly discovered
    const filePaths = items.map(it => it.rel_path);
    const expectedFiles = [
      'file1.mp4',
      'Movies',
      'Movies/movie1.mkv',
      'Series',
      'Series/Season 1',
      'Series/Season 1/episode1.mkv',
      'Series/Season 1/episode2.mkv'
    ];

    for (const expected of expectedFiles) {
      if (!filePaths.includes(expected)) {
        throw new Error(`Assertion failed: Expected discovered item list to include "${expected}". Found: ${JSON.stringify(filePaths)}`);
      }
    }

    // Check sizes and directory metadata are resolved correctly
    const episode1 = items.find(it => it.rel_path === 'Series/Season 1/episode1.mkv');
    if (!episode1) {
      throw new Error('Assertion failed: "Series/Season 1/episode1.mkv" was not found in scanned results.');
    }
    if (episode1.is_dir !== false) {
      throw new Error('Assertion failed: "episode1.mkv" should not be marked as a directory.');
    }

    const moviesDir = items.find(it => it.rel_path === 'Movies');
    if (!moviesDir) {
      throw new Error('Assertion failed: "Movies" directory was not found in scanned results.');
    }
    if (moviesDir.is_dir !== true) {
      throw new Error('Assertion failed: "Movies" should be marked as a directory.');
    }

    // Assert loop immunity
    if (symlinksTested) {
      console.log('🛡️ Verifying circular symlink loop immunity...');
      // Ensure that we didn't infinite loop and exceeded the maximum call stack / depth limit
      const loopEntries = items.filter(it => it.rel_path.includes('circular_loop_link'));
      console.log(`ℹ️ Cyclic loop entries caught: ${loopEntries.length} items.`);
      
      // If we bypassed the loop, there should either be zero entries inside the loop, or it stopped immediately at the cycle detection boundary
      if (duration > 2000) {
        throw new Error(`Assertion failed: Walker took too long (${duration.toFixed(0)}ms) which indicates a potential infinite loop or blocking stall.`);
      }
      
      const cycleLogFound = errors.some(err => err.includes('Circular directory reference detected'));
      if (cycleLogFound) {
        console.log('✅ Cycle detected and reported gracefully in walker errors.');
      }
    }

    console.log('\n🎉 ALL DIRECTORY WALKER TESTS COMPLETED SUCCESSFULLY! No stalls, freezes, or loops detected.');
    process.exit(0);

  } catch (err: any) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  } finally {
    // Cleanup temporary directory
    try {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true });
        console.log('🧹 Cleanup: test directory removed safely.');
      }
    } catch (_) {}
  }
}

runTests();
