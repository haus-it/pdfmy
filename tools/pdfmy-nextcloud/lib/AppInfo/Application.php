<?php
// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
declare(strict_types=1);

namespace OCA\Pdfmy\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\Pdfmy\Listener\LoadScripts;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'pdfmy';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
	}

	public function register(IRegistrationContext $context): void {
		// Skript nur in der App „Dateien“ laden
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadScripts::class);
	}

	public function boot(IBootContext $context): void {
	}
}
