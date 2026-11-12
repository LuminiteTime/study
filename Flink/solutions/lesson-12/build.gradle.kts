plugins {
    java
    id("com.gradleup.shadow") version "9.6.1"
}

group = "dev.study.payguard"
version = "1.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(17)
    }
}

repositories {
    mavenCentral()
}

val flinkVersion = "2.2.1"
val kafkaConnectorVersion = "5.0.0-2.2"
val jdbcConnectorVersion = "4.1.0-2.2"
val jacksonVersion = "2.21.0"

// Классы, которые уже лежат в образе Flink: нужны для компиляции и тестов, в jar не попадают.
val flinkProvided: Configuration by configurations.creating
configurations.compileOnly { extendsFrom(flinkProvided) }
configurations.testImplementation { extendsFrom(flinkProvided) }

dependencies {
    flinkProvided("org.apache.flink:flink-streaming-java:$flinkVersion")
    flinkProvided("org.apache.flink:flink-clients:$flinkVersion")
    flinkProvided("org.apache.flink:flink-connector-base:$flinkVersion")
    flinkProvided("org.apache.flink:flink-json:$flinkVersion")

    implementation("org.apache.flink:flink-connector-kafka:$kafkaConnectorVersion")
    implementation("com.fasterxml.jackson.core:jackson-databind:$jacksonVersion")
    implementation("org.apache.flink:flink-cep:$flinkVersion")
    implementation("org.apache.flink:flink-connector-jdbc-core:$jdbcConnectorVersion")
    implementation("org.apache.flink:flink-connector-jdbc-postgres:$jdbcConnectorVersion")
    implementation("org.postgresql:postgresql:42.7.14")
    implementation("com.zaxxer:HikariCP:7.0.2")

    runtimeOnly("org.slf4j:slf4j-simple:2.0.17")

    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("org.assertj:assertj-core:3.27.7")
    testImplementation("org.apache.flink:flink-test-utils:$flinkVersion")
    testImplementation("org.apache.flink:flink-streaming-java:$flinkVersion:tests")
    testImplementation("org.apache.flink:flink-runtime:$flinkVersion:tests")
}

tasks.test {
    useJUnitPlatform()
}

tasks.shadowJar {
    archiveClassifier = ""
    manifest { attributes["Main-Class"] = "dev.study.payguard.job.PayGuardJob" }
    mergeServiceFiles()
    filesMatching("META-INF/services/**") { duplicatesStrategy = DuplicatesStrategy.INCLUDE }
    dependencies { exclude(dependency("org.slf4j:.*:.*")) }
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA")
}

tasks.build {
    dependsOn(tasks.shadowJar)
}

tasks.register<JavaExec>("loadgen") {
    group = "application"
    description = "Запускает генератор платежей: ./gradlew loadgen --args='--rate 200'"
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass = "dev.study.payguard.loadgen.LoadGenerator"
    systemProperty("org.slf4j.simpleLogger.defaultLogLevel", "warn")
}
