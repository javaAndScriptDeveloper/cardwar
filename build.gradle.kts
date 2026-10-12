plugins {
    id("java")
    id("jacoco")
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.diffplug.spotless") version "7.2.1"
    // Dependency vulnerability scanning. Deliberately NOT wired into `check`: it pulls an external
    // advisory feed, and a feed outage must never be able to break an ordinary local build.
    id("org.owasp.dependencycheck") version "12.1.3"
}

group = "cardwar"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        // Gradle auto-provisions this JDK via the foojay resolver (settings.gradle.kts)
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

// Managed-version overrides above what Spring Boot 4.1.1 ships, taken from the dependency-check report's fix
// versions (Tomcat needs 11.0.25+, Netty 4.2.18+). Remove each once a Boot patch manages at least that version.
extra["tomcat.version"] = "11.0.26"
extra["netty.version"] = "4.2.18.Final"
// Jackson 2 is only here transitively (springdoc -> swagger-core, which asks for 2.22.x); 2.21.5+ fixes
// CVE-2026-54515, and 2.22.3 avoids downgrading what springdoc requests.
extra["jackson-2-bom.version"] = "2.22.3"

dependencies {
    // Lombok
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok-mapstruct-binding:0.2.0")

    // MapStruct
    implementation("org.mapstruct:mapstruct:1.6.3")
    annotationProcessor("org.mapstruct:mapstruct-processor:1.6.3")

    // Spring Boot Starters
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    // Prometheus exposition for /actuator/prometheus, scraped by Grafana Alloy (docs/observability.md)
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("org.springframework.boot:spring-boot-starter-cache")
    // Caffeine backs the cache abstraction above (starter-cache alone only ships a simple in-memory map)
    implementation("com.github.ben-manes.caffeine:caffeine")

    // AOP: Boot 4 dropped spring-boot-starter-aop; spring-aspects pulls AspectJ + enables @Aspect support
    implementation("org.springframework:spring-aspects")

    // Authentication, authorization and the filter chain
    implementation("org.springframework.boot:spring-boot-starter-security")

    // Active duel state and the per-duel event channel
    implementation("org.springframework.boot:spring-boot-starter-data-redis")

    // JWT issuing and verification (impl + jackson are runtime-only by JJWT's own convention)
    implementation("io.jsonwebtoken:jjwt-api:0.13.0")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.13.0")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.13.0")

    // In-memory token buckets backing the API rate limiter
    implementation("com.bucket4j:bucket4j-core:8.10.1")

    // API Documentation (OpenAPI 3 / Swagger UI)
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.1.1")

    // Database Migration. Boot 4 split the Liquibase auto-configuration into its own module: liquibase-core
    // alone puts the library on the classpath but leaves nothing to run it at startup.
    implementation("org.liquibase:liquibase-core")
    implementation("org.springframework.boot:spring-boot-liquibase")

    // PostgreSQL Driver
    runtimeOnly("org.postgresql:postgresql")

    // Local development: manage docker-compose.yml lifecycle automatically on bootRun
    developmentOnly("org.springframework.boot:spring-boot-docker-compose")

    // Test Dependencies (JUnit 5, AssertJ, Mockito, JSONassert ship with starter-test)
    testCompileOnly("org.projectlombok:lombok")
    testAnnotationProcessor("org.projectlombok:lombok")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // Boot 4 split MockMvc test support (@AutoConfigureMockMvc) into its own module
    testImplementation("org.springframework.boot:spring-boot-webmvc-test")

    // Integration testing against a real PostgreSQL via Testcontainers
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")

    // Integration testing against a real Redis via Testcontainers
    testImplementation("com.redis:testcontainers-redis:2.2.4")

    // Random, fully-populated test objects — the project convention over hand-built fixtures
    testImplementation("org.instancio:instancio-junit:5.4.1")
    // Architecture rules enforced as tests (layering, naming, no field injection)
    testImplementation("com.tngtech.archunit:archunit-junit5:1.4.2")
}

dependencyManagement {
    imports {
        // Boot 4.1 no longer manages Testcontainers versions; pin them via the Testcontainers BOM.
        mavenBom("org.testcontainers:testcontainers-bom:1.21.4")
    }
}

// Populate /actuator/info with build metadata
springBoot {
    buildInfo()
}

tasks.withType<JavaCompile> {
    options.compilerArgs.add("-Amapstruct.defaultComponentModel=spring")
    options.encoding = "UTF-8"
}

tasks.withType<Test> {
    useJUnitPlatform()
    systemProperty("junit.jupiter.extensions.autodetection.enabled", true)
    systemProperty("file.encoding", "UTF-8")
    finalizedBy(tasks.jacocoTestReport)
}

// Classes with no meaningful branches to cover — excluded from the coverage report and gate.
val coverageExclusions = listOf("cardwar/Application.class", "cardwar/config/**")

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required = true
        html.required = true
    }
    classDirectories.setFrom(
        classDirectories.files.map {
            fileTree(it) { exclude(coverageExclusions) }
        },
    )
}

tasks.jacocoTestCoverageVerification {
    classDirectories.setFrom(
        classDirectories.files.map {
            fileTree(it) { exclude(coverageExclusions) }
        },
    )
    violationRules {
        rule {
            limit {
                // The suite covers ~94% of instructions; the floor sits a little below so that an ordinary change
                // does not trip it while a change that ships untested code does.
                counter = "INSTRUCTION"
                value = "COVEREDRATIO"
                minimum = "0.85".toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}

// Report-only by design: `failBuildOnCVSS` above every possible score means the scan reports and never
// fails. Run it with `./gradlew dependencyCheckAnalyze`; CI runs it as its own job.
dependencyCheck {
    formats = listOf("HTML", "JSON")
    failBuildOnCVSS = 11.0f
    // Optional but strongly recommended: an NVD API key lifts the feed's unauthenticated rate limit.
    nvd.apiKey = System.getenv("NVD_API_KEY") ?: ""
    // Sonatype OSS Index rejects unauthenticated component-report requests and the plugin treats an analyzer
    // error as a failed analysis, which turned a report-only task into a hard failure. NVD is the source that
    // matters here; the OSS Index cross-check can be re-enabled once credentials are configured.
    analyzers.ossIndex.enabled = false
}

spotless {
    java {
        target("src/*/java/**/*.java")
        // Pinned: palantir-java-format below 2.71.0 crashes on JDK 25 (javac's
        // DeferredDiagnosticHandler.getDiagnostics changed its return type)
        palantirJavaFormat("2.74.0")
        importOrder()
        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()
    }
    kotlinGradle {
        target("*.gradle.kts")
        ktlint()
    }
}
