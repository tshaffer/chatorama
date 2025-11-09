# Collected tsconfig files

## packages/chat-md-core/tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,

    "lib": ["ES2021", "DOM"],
    "rootDir": "src",
    "outDir": "dist",

    "declaration": true,
    "declarationMap": true,
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist"]
}
```

## packages/chatalog/backend/tsconfig.build.json
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false }
}
```

## packages/chatalog/backend/tsconfig.json
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Node",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "composite": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

## packages/chatalog/frontend/tsconfig.json
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": [
      "ES2020",
      "DOM"
    ],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "baseUrl": ".",
    "types": [
      "node",
      "webpack-env"
    ],
    "paths": {
      "@shared/*": [
        "../shared/src/*"
      ]
    },
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "emitDeclarationOnly": false,
    "declarationMap": false,
    "sourceMap": true
  },
  "include": [
    "src"
  ]
}```

## packages/chatalog/shared/tsconfig.json
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Node",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

## packages/chatworthy/tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,

    "lib": ["ES2021", "DOM"],
    "types": ["node"],

    "rootDir": ".",           // ← include src/ and scripts/
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["dist"],
  "references": [{ "path": "../chat-md-core" }]
}
```

