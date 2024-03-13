JWT_ISSUER=
JWT_SECRET=
ADB_PATH=
ADB_IP=
ADB_PORT=
RELEASE_DIR=../ifritJP.github.io/files
CHANNEL=unlisted

#FIREFOX_PACK=org.mozilla.fenix
FIREFOX_PACK=org.mozilla.firefox

ifneq "$(wildcard Makefile.local)" ""
include Makefile.local
endif


ifdef EXT_ID
EXT_ID_OP=--id="$(EXT_ID)"
endif

all:
	@echo make run-ext
	@echo make sign
	@echo make sign-channel
	@echo make run-ext-adb ADB_IP=***.***.***.*** ADB_PORT=xxxx
	@echo make adb-pair ADB_IP=***.***.***.*** ADB_PORT=xxxx
	@echo make adb-connect ADB_IP=***.***.***.*** ADB_PORT=xxxx
	@echo make release

run-ext:
	web-ext run -s src --devtools --keep-profile-changes		\
		-p ~/.cache/mozilla/firefox/web-ext/ --profile-create-if-missing

build:
	web-ext build -s src -o \
		$(EXT_ID_OP)				\
		-i Makefile.local -i ".git" -i '*~'	\
		-i 'src/*~'				\
		-i 'src/options/*~'

sign:
	web-ext sign -s src --api-key=$(JWT_ISSUER)		\
		--api-secret=$(JWT_SECRET)		\
		$(EXT_ID_OP)				\
		--channel $(CHANNEL)			\
		-i Makefile.local -i ".git" -i '*~'	\
		-i 'src/*~'				\
		-i 'src/options/*~'

sign-channel:
	$(MAKE) sign CHANNEL="listed"

adb-kill:
	${ADB_PATH} kill-server

adb-pair:
	${ADB_PATH} pair $(ADB_IP):$(ADB_PORT)

adb-connect:
	${ADB_PATH} connect $(ADB_IP):$(ADB_PORT)
	${ADB_PATH} devices



run-ext-adb:
	${ADB_PATH} shell pm grant $(FIREFOX_PACK)	\
		android.permission.READ_EXTERNAL_STORAGE

	web-ext run -s src -t firefox-android			\
		--adb-device $(ADB_IP):$(ADB_PORT)	\
		--adb-bin "${ADB_PATH}"			\
		--firefox-apk $(FIREFOX_PACK)

release:
	$(MAKE) release_sub			\
		XPI=$(shell ls -tr web-ext-artifacts | tail -n 1)

ifdef XPI
VER=$(shell echo $(XPI) | sed 's/.*-//' | sed 's/\.xpi//')
endif


release_sub:
	cp web-ext-artifacts/$(XPI) $(RELEASE_DIR)/mnbw.xpi
	cat mnbw.json | sed 's/<VERSION>/$(VER)/' > $(RELEASE_DIR)/mnbw.json
