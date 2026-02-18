/**
 * LobsterBoard Rollup Configuration
 * 
 * Outputs:
 * - dist/lobsterboard.umd.js     (UMD, unminified)
 * - dist/lobsterboard.umd.min.js (UMD, minified)
 * - dist/lobsterboard.esm.js     (ES Module, unminified)
 * - dist/lobsterboard.esm.min.js (ES Module, minified)
 * - dist/lobsterboard.css        (Styles)
 */

import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Read package version
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const banner = `/*!
 * LobsterBoard v${pkg.version}
 * Dashboard builder with customizable widgets
 * https://github.com/curbob/LobsterBoard
 * @license MIT
 */`;

// Custom plugin to generate CSS from builder.js
function generateCss() {
  return {
    name: 'generate-css',
    writeBundle() {
      // Import the generateDashboardCss function and write the CSS
      import('./src/builder.js').then(({ generateDashboardCss }) => {
        const css = generateDashboardCss();
        const cssPath = './dist/lobsterboard.css';
        try {
          mkdirSync(dirname(cssPath), { recursive: true });
        } catch (e) {}
        writeFileSync(cssPath, `/* LobsterBoard v${pkg.version} - Dashboard Styles */\n${css}`);
        console.log('Generated dist/lobsterboard.css');
      }).catch(err => {
        console.warn('Could not generate CSS:', err.message);
      });
    }
  };
}

// Shared output options
const outputDefaults = {
  banner,
  sourcemap: true
};

export default [
  // UMD build (for browsers via script tag)
  {
    input: 'src/index.js',
    output: [
      {
        ...outputDefaults,
        file: 'dist/lobsterboard.umd.js',
        format: 'umd',
        name: 'LobsterBoard',
        exports: 'named'
      },
      {
        ...outputDefaults,
        file: 'dist/lobsterboard.umd.min.js',
        format: 'umd',
        name: 'LobsterBoard',
        exports: 'named',
        plugins: [terser({
          format: {
            comments: /^!/  // Keep banner comment
          }
        })]
      }
    ],
    plugins: [
      generateCss()
    ]
  },
  // ESM build (for modern bundlers and Node.js)
  {
    input: 'src/index.js',
    output: [
      {
        ...outputDefaults,
        file: 'dist/lobsterboard.esm.js',
        format: 'es'
      },
      {
        ...outputDefaults,
        file: 'dist/lobsterboard.esm.min.js',
        format: 'es',
        plugins: [terser({
          format: {
            comments: /^!/
          }
        })]
      }
    ]
  }
];
