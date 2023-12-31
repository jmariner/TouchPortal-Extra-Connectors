NAME=TouchPortal-Extra-Connectors
SRC=src
OUT=out
PLUGIN_OUT=%APPDATA%\TouchPortal\plugins\$(NAME)

plugin: $(OUT)/$(NAME).exe

$(OUT)/$(NAME).exe: $(SRC)/*.js $(SRC)\plugin.json package.json
	yarn run pkg --compress GZip $(SRC)/index.js -c package.json -t node18-windows-x64 -o $(OUT)/$(NAME).exe
	xcopy node_modules\zeromq\prebuilds $(OUT)\prebuilds /Q /E /Y /I >NUL
	copy $(SRC)\plugin.json $(OUT)\entry.tp >NUL

deploy: plugin
	xcopy $(OUT) "$(PLUGIN_OUT)" /Q /E /Y /I >NUL

run: $(OUT)/$(NAME).exe
	$(OUT)/$(NAME).exe

undeploy:
	taskkill /F /T /IM TouchPortal.exe /FI "STATUS eq RUNNING" >NUL
	rmdir /S /Q "$(PLUGIN_OUT)" >NUL

clean:
	del /Q $(OUT)\* >NUL