mkdir media
mkdir src/module
mkdir src/styles && mkdir src/styles/themes
mv src/app src/module
mkdir src/module/app/layout
cd src && ln -s . app & cd .
sed -i .bak 's/.\/app/.\/module\/app/g' src/main.ts
ng generate module module/Shared
ng generate module module/Data
json --version || npm install -g json
json -f tsconfig.json -I -c "this.baseUrl = './'"
json -f tsconfig.json -I -c "this.compilerOptions.paths = {}"
json -f tsconfig.json -I \
  -e "this.compilerOptions.paths['@app/*'] = ['src/module/app/*']" \
  -e "this.compilerOptions.paths['@shared/*'] = ['src/module/shared/*']" \
  -e "this.compilerOptions.paths['@module/*'] = ['src/module/*']" \
  -e "this.compilerOptions.paths['@env'] = ['src/environments/environment']" \
  -e "this.compilerOptions.paths['@data/*'] = ['src/module/data/*']"
mkdir -p .vscode
test -f .vscode/settings.json || echo "{}" > .vscode/settings.json
json -f .vscode/settings.json -I -e "this['files.exclude'] = {'**src/app': true}"
